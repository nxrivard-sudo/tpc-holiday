"""Worker unit tests use mocks only: no outbound email or HoneyBook writes."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import holiday_planner_leads as worker

P={'name':'QA <script>','email':'qa@example.invalid','phone':'','date':'2026-12-12','area':'Orange County','guests':20,'kids':2,'rows':[['Catering <img>','$1,000'],['22% service and production','$220'],['Estimated sales tax (Orange County)','$95'],['Estimated total','$1,315']],'total':'$1,315','total_amount':1315,'summary':'Holiday selections','disclaimer':'An estimate, not a quote.'}
ID='a'*64
HB={'project_id':'mock-project','workspace_id':'mock-workspace','contact_id':'mock-contact','lead_status':'lead','verified':True}

class WorkerTests(unittest.TestCase):
    def test_email_itemization_and_identity(self):
        msg=worker.message(ID,P)
        self.assertEqual(msg['To'],P['email'])
        self.assertEqual(msg['Subject'],"Here's your holiday estimate")
        text=msg.get_body(preferencelist=('plain',)).get_content()
        markup=msg.get_body(preferencelist=('html',)).get_content()
        for label,amount in P['rows']:
            self.assertIn(label+': '+amount,text);self.assertIn(amount,markup)
        self.assertNotIn('<script>',markup);self.assertNotIn('<img>',markup)
        self.assertIn('&lt;img&gt;',markup)
        for s in ['949-234-7102','Cheers, Lauren','927 Calle Negocio, Suite E, San Clemente CA 92673','?src=estimate_email','An estimate, not a quote.']:
            self.assertIn(s,text);self.assertIn(s,markup)
        self.assertEqual(msg['Message-ID'],worker.message(ID,P)['Message-ID'])

    def test_idempotent_processing(self):
        record={};alerts=[]
        with patch.object(worker,'honeybook',return_value=HB) as hb,patch.object(worker,'smtp_send') as send:
            for _ in range(2):self.assertTrue(worker.process(ID,P,record,lambda:None,lambda *args:alerts.append(args) or True))
            self.assertEqual(hb.call_count,1);self.assertEqual(send.call_count,1);self.assertEqual(len(alerts),1)
        self.assertIn('Source: at-home planner',alerts[0][1]);self.assertIn(P['total'],alerts[0][1])

    def test_uncertain_send_never_retried(self):
        record={}
        with patch.object(worker,'honeybook',return_value=HB),patch.object(worker,'smtp_send',side_effect=TimeoutError) as send:
            with self.assertRaises(TimeoutError):worker.process(ID,P,record,lambda:None,lambda *a:True)
            with self.assertRaisesRegex(RuntimeError,'SMTP_uncertain'):worker.process(ID,P,record,lambda:None,lambda *a:True)
            self.assertEqual(send.call_count,1);self.assertEqual(record['email'],'attempting')

    def test_pending_alert_does_not_ack(self):
        record={'honeybook':HB,'email':'sent'}
        self.assertFalse(worker.process(ID,P,record,lambda:None,lambda *a:False))
        self.assertNotIn('alerted',record)

    def test_payload_json_not_interpolated_as_code(self):
        evil={**P,'name':'TITLE PAYLOAD "; throw Error(1); //'}
        with patch.object(worker,'mcp',return_value=HB) as m:
            worker.honeybook(ID,evil)
            code=m.call_args.args[0]
            self.assertIn('name_contains:title',code)
            self.assertNotIn('communications',code)
            self.assertTrue(m.call_args.kwargs['write'])

if __name__=='__main__':unittest.main(verbosity=2)
