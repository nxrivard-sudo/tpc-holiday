#!/usr/bin/env python3
"""At-home planner intake worker. Invoked by holiday_inquiry_alert; no paid APIs.
Private state prevents repeated HoneyBook creates and SMTP duplicate sends.
"""
import datetime as dt
import fcntl
import html
import json
import smtplib
import ssl
import time
from email.message import EmailMessage
from pathlib import Path
import requests

ROOT = Path('/mnt/c/Users/nxriv/email-batch-sender')
STATE = Path.home()/'.hermes/state/holiday_planner_leads.json'
ENDPOINT = 'https://script.google.com/macros/s/AKfycbwRRRt6sh7mDnbeth36U42YV1wDcaErmySejMLe0rKVPt6HpfbCe2SzxKSVSRJ35_FQJw/exec'
BOOK = 'https://thepicniccollective.hbportal.co/schedule/66673cf26bf84d002bbb2e10?src=estimate_email'


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, indent=2)); temp.chmod(0o600); temp.replace(path)


def mcp(code, write=False):
    path = Path.home()/'.hermes/mcp-tokens/honeybook.json'
    with open(path.with_suffix('.planner.lock'), 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        token = json.loads(path.read_text())
        if token.get('expires_at', 0) < time.time()+90:
            meta = json.loads(path.with_name('honeybook.meta.json').read_text())
            client = json.loads(path.with_name('honeybook.client.json').read_text())
            response = requests.post(meta['token_endpoint'], data={'grant_type':'refresh_token','refresh_token':token['refresh_token'],'client_id':client['client_id']}, timeout=30)
            if not response.ok: raise RuntimeError('HoneyBook_refresh_failed')
            token.update(response.json()); token['expires_at'] = time.time()+token.get('expires_in',3600)
            atomic(path, token)
    response = requests.post('https://mcp.api.honeybook.com/mcp', json={'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'take_action' if write else 'take_action_read_only','arguments':{'intent':'Capture approved Holiday-at-Home planner lead and project; no HoneyBook communications','code':code}}}, headers={'Authorization':'Bearer '+token['access_token'],'Accept':'application/json, text/event-stream'}, timeout=70)
    if not response.ok: raise RuntimeError('HoneyBook_HTTP_'+str(response.status_code))
    text = response.text
    if text.startswith('event:') or 'data: ' in text:
        text = next(line[6:] for line in text.splitlines() if line.startswith('data: '))
    rpc = json.loads(text)
    if 'error' in rpc or rpc.get('result',{}).get('isError'): raise RuntimeError('HoneyBook_RPC_failed')
    text = '\n'.join(c.get('text','') for c in rpc['result'].get('content',[]))
    try: value = json.loads(text)
    except ValueError:
        value = json.loads(next(line for line in reversed(text.splitlines()) if line.strip().startswith('{')))
    if isinstance(value,dict) and 'result' in value:
        value = value['result']; value = json.loads(value) if isinstance(value,str) else value
    if not isinstance(value,dict): raise RuntimeError('HoneyBook_result_invalid')
    return value


def honeybook(lead_id, p):
    # Stable marker recovers a create that succeeded before the network disconnected.
    name = p['name']+' — Holiday at Home ['+lead_id[:12]+']'
    data = {k:p.get(k) for k in ['name','email','phone','date','area','guests','total_amount','summary','disclaimer','rows']}
    code = 'const p='+json.dumps(data)+'; const title='+json.dumps(name)+';\n'+"""import { ContactsAdapter } from '@honeybook/sdk/contacts';
import { ProjectsAdapter } from '@honeybook/sdk/projects';
import { WorkspacesAdapter } from '@honeybook/sdk/workspaces';
const ca=new ContactsAdapter(httpClient), pa=new ProjectsAdapter(httpClient), wa=new WorkspacesAdapter(httpClient);
const found=await ca.listContacts({params:{query:p.email,per_page:100}});
let contact=found.data.find(c=>c.email.toLowerCase()===p.email.toLowerCase());
if(!contact) contact=await ca.createContact({data:{email:p.email,full_name:p.name,kind:'client',source:'manual',...(p.phone?{phone_number:p.phone}:{}),private_notes:'Source: at-home planner'}});
const matches=await pa.listProjects({params:{name_contains:title,include:['workspaces'],per_page:100}});
let project=matches.data.find(x=>x.name===title);
if(!project) project=await pa.createProject({data:{name:title,include:['workspaces'],...(p.date?{project_date:p.date}:{}),project_timezone:'America/Los_Angeles',project_location:p.area,guest_count:p.guests,budget:p.total_amount,availability_type:'free',lead_source_open_text:'at-home planner',project_details:'Source: at-home planner\\n'+p.summary+'\\n\\n'+p.rows.map(r=>r.join(': ')).join('\\n')+'\\n'+p.disclaimer}});
project=await pa.getProject({id:project.id,params:{include:['workspaces']}});
const wid=project.workspaces.data[0].id;
await wa.addWorkspaceMember({id:wid,userId:contact.user_id});
const checked=await wa.getWorkspace({id:wid,params:{include:['pipeline_stage']}});
const members=await wa.listWorkspaceMembers({id:wid,params:{per_page:100}});
if(!members.data.some(m=>m.user_id===contact.user_id))throw Error('Lead membership missing');
if(!['lead','lead_sent'].includes(checked.status))throw Error('Not a lead workspace');
console.log(JSON.stringify({project_id:project.id,workspace_id:wid,contact_id:contact.id,lead_status:checked.status,stage:checked.pipeline_stage,verified:true}));
"""
    return mcp(code,write=True)


def message(lead_id, p):
    msg = EmailMessage()
    msg['Subject'] = "Here's your holiday estimate"
    msg['From'] = 'Lauren at The Picnic Collective <events@thepicniccollective.com>'
    msg['To'] = p['email']; msg['Reply-To'] = 'events@thepicniccollective.com'
    msg['Message-ID'] = '<holiday-estimate-'+lead_id+'@thepicniccollective.com>'
    msg['Date'] = dt.datetime.now(dt.timezone.utc).strftime('%a, %d %b %Y %H:%M:%S %z')
    greeting = 'Hi '+p['name'].split()[0]+','
    intro = "Here's your holiday estimate, with everything you picked for your party. I can't wait to help you bring it to life."
    details = 'Guests: '+str(p['guests'])+' adults'+(' · '+str(p.get('kids',0))+' kids' if p.get('kids') else '')+'\nArea: '+p['area']+('\nParty date: '+p['date'] if p.get('date') else '')
    lines = '\n'.join(label+': '+amount for label,amount in p['rows'])
    closing = "Want to talk through the details or a version that fits your group? Book a free call with me:\n"+BOOK+"\nOr call or text 949-234-7102.\n\nCheers, Lauren\nThe Picnic Collective\n927 Calle Negocio, Suite E, San Clemente CA 92673"
    msg.set_content('\n\n'.join([greeting,intro,details,lines,'An estimate, not a quote.',p['disclaimer'],closing]))
    esc = html.escape
    rows = ''.join('<tr><td style="padding:10px 0;border-bottom:1px solid #ded7c9">'+esc(label)+'</td><td style="padding:10px 0;text-align:right;border-bottom:1px solid #ded7c9;white-space:nowrap">'+esc(amount)+'</td></tr>' for label,amount in p['rows'])
    msg.add_alternative('<!doctype html><html><body style="margin:0;background:#f5f1e8;color:#283a32;font-family:Georgia,serif"><div style="max-width:620px;margin:28px auto;padding:32px;background:#fffdf8"><p style="letter-spacing:3px;font-size:12px">THE PICNIC COLLECTIVE</p><h1>Here’s your holiday estimate</h1><p>'+esc(greeting)+'</p><p>'+esc(intro)+'</p><p>'+esc(details).replace('\n','<br>')+'</p><table style="width:100%;border-collapse:collapse">'+rows+'</table><p><strong>An estimate, not a quote.</strong></p><p style="font-size:13px">'+esc(p['disclaimer'])+'</p><p>Want to talk through the details or a version that fits your group?</p><p><a style="display:inline-block;padding:14px 22px;background:#283a32;color:#fffdf8;text-decoration:none" href="'+BOOK+'">Book a free call with Lauren</a></p><p>Or call or text <a href="tel:+19492347102">949-234-7102</a>.</p><p>Cheers, Lauren<br>The Picnic Collective</p><p style="font-size:12px">927 Calle Negocio, Suite E, San Clemente CA 92673</p></div></body></html>', subtype='html')
    return msg


def smtp_send(msg):
    config = json.loads((ROOT/'config.json').read_text())['smtp']
    password = (ROOT/config['passwordFile']).read_text().strip()
    with smtplib.SMTP(config['host'],config['port'],timeout=30) as smtp:
        smtp.starttls(context=ssl.create_default_context()); smtp.login(config['user'],password)
        smtp.send_message(msg)


def process(lead_id, p, record, persist, alert):
    if not record.get('honeybook'):
        record['honeybook'] = honeybook(lead_id,p); persist()
    if not record.get('email'):
        # SMTP cannot offer exactly-once delivery. Reserve before sending; an unknown
        # result is held for Gmail reconciliation, never automatically duplicated.
        record['email'] = 'attempting'; persist()
        smtp_send(message(lead_id,p)); record['email'] = 'sent'; persist()
    if record['email'] != 'sent':
        raise RuntimeError('SMTP_uncertain_requires_Gmail_reconciliation')
    if not record.get('alerted'):
        hb = record['honeybook']
        text = 'New TPC inquiry: '+p['name']+'\nSource: at-home planner\nEstimated total: '+p['total']+'\n'+p['email']+(' | '+p['phone'] if p.get('phone') else '')+('\nDate: '+p['date'] if p.get('date') else '')+'\nhttps://app.honeybook.com/app/event/'+hb['project_id']
        if not alert('planner:'+lead_id,text,text.replace('\n',' | ')[:300]): return False
        record['alerted'] = True; persist()
    return True


def run(alert, dry=False):
    # Rollout gate: activate only after Apps Script deployment and the single QA.
    if not dry and not STATE.with_suffix('.enabled').exists(): return
    health = requests.get(ENDPOINT,params={'action':'planner_health'},timeout=15)
    try: ready = health.ok and health.json().get('planner_schema') == 1
    except ValueError: ready = False
    if not ready:
        print('Planner intake BLOCKED: Apps Script Planner.gs redeploy required.'); return
    secret = (ROOT/'.secrets/unsub-secret').read_text().strip()
    response = requests.get(ENDPOINT,params={'action':'planner_list','key':secret},timeout=20)
    if not response.ok: raise RuntimeError('Planner_list_HTTP_failed')
    batch = response.json()
    if not batch.get('ok'): raise RuntimeError('Planner_list_auth_failed')
    if dry:
        print('DRY planner queued leads:',len(batch['leads'])); return
    STATE.parent.mkdir(parents=True,exist_ok=True)
    with open(STATE.with_suffix('.lock'),'w') as lock:
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: return
        state = json.loads(STATE.read_text()) if STATE.exists() else {}
        def persist(): atomic(STATE,state)
        for lead_id,p in list(batch['leads'].items())[:1]:
            record = state.setdefault(lead_id,{})
            if process(lead_id,p,record,persist,alert):
                ack = requests.post(ENDPOINT,json={'action':'planner_ack','id':lead_id,'key':secret},timeout=20)
                if not ack.ok or not ack.json().get('ok'): raise RuntimeError('Planner_ack_failed')
                # Confirm the external queue mutation, not just its response.
                check = requests.get(ENDPOINT,params={'action':'planner_list','key':secret},timeout=20).json()
                if not check.get('ok') or lead_id in check['leads']: raise RuntimeError('Planner_ack_readback_failed')
                record['acked'] = True; persist()


if __name__ == '__main__':
    run(lambda *args: False,dry=True)
