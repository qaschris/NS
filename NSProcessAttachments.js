/*
 * trigger name: NSProcessAttachments
 * call source: NS specific JUnit parser via emitEvent()
 * payload example:
        {
            "projectId": "122526",
            "logs": [
                {
                "status": "passed",
                "name": "Report Attachments",
                "note": "",
                "exe_start_date": "2022-03-14T00:28:22.049Z",
                "exe_end_date": "2022-03-14T00:28:22.049Z",
                "automation_content": "Report Attachments",
                ...
                }
            ],
            "attachments": [
                {
                "name": "Test_Execution_20220216_120555.rxzlog",
                "content_type": "application/zip",
                "data": "UEsDBBQAAAgIAIVzUFR1jjg/kYQCANUsCQAkAAAAVGVzdF9F..."
                }
            ]
        }
 * constants:
 *  QTEST_TOKEN: the qTest user bearer token from the API/SDK section of the 'Resources' area
        Ex. 02e74731-2f6e-4b95-b928-1596a68881e2
 *  Manager_URL: the base qTest Manager domain with no protocol information, https is expected by the script
        Ex. demo.qtestnet.com
 *  NSAttachmentsCaseID: the test case ID of the test case wherein the attachments are to be stored
        Ex. 53991037
 * outputs: standardized construct to be consumed by the qTest attachment API, plus an attachment URL reference
 * external documentation: https://qtest.dev.tricentis.com/#/attachment/upload
 * Pulse events called: NSProcessResults, ChatOpsEvent (optional)
 */

const request = require('request');
const { Webhooks } = require('@qasymphony/pulse-sdk');

exports.handler = async function ({ event: body, constants, triggers }, context, callback) {
    function emitEvent(name, payload) {
        let t = triggers.find(t => t.name === name);
        return t && new Webhooks().invoke(t, payload);
    }

    const uploadTestCaseAttachment = async(ProjectId, TestCaseId, AttachmentObject) => {
        console.log('[DEBUG] (uploadTestCaseAttachment): Executing with parameters ' + [ProjectId, TestCaseId, JSON.stringify(AttachmentObject.name)].join(', '));
        return await new Promise(async(resolve, reject) => {
            var options = {
                'method': 'POST',
                'url': 'https://'+constants.ManagerURL+'/api/v3/projects/'+ProjectId+'/test-cases/'+TestCaseId+'/blob-handles',
                'headers': {
                    'Authorization': 'Bearer ' + constants.QTEST_TOKEN,
                    'File-Name': AttachmentObject.name,
                    'Content-Type': AttachmentObject.content_type
                },
                'encoding': null,
                'body': AttachmentObject.data
            };
            request(options, function (error, response) {
                if (error) {
                    console.log('[ERROR] (uploadTestCaseAttachment):' + error);
                    return reject(error);
                } else {
                    console.log('[DEBUG] (uploadTestCaseAttachment): ' + response.body);
                    return resolve(response.body);
                }
            });
        });
    }
    
    let payload = body;
    let projectId = payload.projectId;

    let qTestAttachmentInfo;
    let qTestCustomAttachmentURLField;

    let attachmentObject = {
        'name': payload.attachment.name,
        'content_type': payload.attachment.content_type,
        'data': Buffer.from(payload.attachment.data, 'base64').toString('utf8')
    };

    await uploadTestCaseAttachment(projectId, constants.NSAttachmentsCaseID, attachmentObject).then((object) => {
        qTestAttachmentInfo = JSON.parse(object);
        // needs to match format: https://qaschris.qtestnet.com/p/122526/portal/attachment/testcase/attachmentId/32974123?forceDownload=true
        qTestCustomAttachmentURLField = {
            'attachment_url': 'https://'+constants.ManagerURL+'/p/'+projectId+'/portal/attachment/testcase/attachmentId/'+qTestAttachmentInfo.id+'?forceDownload=true'
        };
        console.log('[DEBUG]: qTestCustomAttachmentURLField: ' + JSON.stringify(qTestCustomAttachmentURLField));
        payload.attachment.length = 0; // gets rid of the old weighty attachment object
        payload.attachment = qTestCustomAttachmentURLField; // replaces it with the lightweight object reference
        console.log('[DEBUG]: New payload: ' + JSON.stringify(payload));
        emitEvent('NSProcessResults', payload); // push it to the results processing rule
    }).catch((error) => {
        console.log('[ERROR]: ' + error);
    });

}