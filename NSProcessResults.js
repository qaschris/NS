/*
 * trigger name: NSProcessResults
 * call source: NSProcessAttachments via emitEvent()
 * payload example:
    {
        "projectId": "122526",
        "testsuiteId": "1234567"
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
            {"url": "https://qaschris.qtestnet.com/p/122526/portal/attachment/testcase/attachmentId/32974225?forceDownload=true"}
        ]
    }
 * constants:
 *  QTEST_TOKEN: the qTest user bearer token from the API/SDK section of the 'Resources' area
        Ex. 02e74731-2f6e-4b95-b928-1596a68881e2
 *  Manager_URL: the base qTest Manager domain with no protocol information, https is expected by the script
        Ex. demo.qtestnet.com
 *  NSAttachmentsField: the field ID of the custom field wherein the attachment URLs are to be stored
        Ex. 53991037
 * outputs: standardized construct to be consumed by the qTest attachment API
 * external documentation: https://qtest.dev.tricentis.com/#/attachment/upload
 * Pulse events called: ChatOpsEvent (optional)
 */

const request = require('request');
const { Webhooks } = require('@qasymphony/pulse-sdk');

exports.handler = async function ({ event: body, constants, triggers }, context, callback) {
	function emitEvent(name, payload) {
		let t = triggers.find(t => t.name === name);
		return t && new Webhooks().invoke(t, payload);
	}

    const getTestRunFieldValues = async(ProjectId) => {
        console.log('[DEBUG] (getTestRunFieldValues): Executing with parameters ' + ProjectId);
        return await new Promise(async(resolve, reject) => {        
            var options = {
                'method': 'GET',
                'url': 'https://'+constants.ManagerURL+'/api/v3/projects/'+ProjectId+'/settings/test-runs/fields',
                'headers': {
                    'Authorization': 'Bearer ' + constants.QTEST_TOKEN,
                    'Accept-Type': 'application/json',
                    'Content-Type': 'application/json'
                }
            };
            request(options, function (error, response) {
                if (error) {
                    console.log('[ERROR] (getTestRunFieldValues):' + JSON.stringify(error));
                    return reject(error);
                } else {
                    console.log('[DEBUG] (getTestRunFieldValues): ' + response.body);
                    return resolve(response.body);
                }
            });
        });
    };
	
	const searchForTestRun = async(ProjectId, AutomationContent) => {
        console.log('[DEBUG] (searchForTestRun): Executing with parameters ' + [ProjectId, AutomationContent].join(','));
        return await new Promise(async(resolve, reject) => {
            var options = {
                'method': 'POST',
                'url': 'https://'+constants.ManagerURL+'/api/v3/projects/'+ProjectId+'/search',
                'headers': {
                    'Authorization': 'Bearer ' + constants.QTEST_TOKEN,
                    'Accept-Type': 'application/json',
                    'Content-Type': 'application/json'
                },
                'body': JSON.stringify({
                    "object_type": "test-runs",
                    "fields": [
                        "*"
                    ],
                    "query": "'Test Case Automation Content' = '" + AutomationContent + "'"
                })
            };
            request(options, function (error, response) {
                if (error) {
                    console.log('[ERROR] (searchForTestRun):' + error);
                    return reject(error);
                } else {
                    console.log('[DEBUG] (searchForTestRun): Response Body: ' + response.body);
                    return resolve(response.body);
                }
            });
        });
    };
	
	const searchForTestCase = async(ProjectId, AutomationContent) => {
        console.log('[DEBUG] (searchForTestCase): Executing with parameters ' + [ProjectId, AutomationContent].join(','));
        return await new Promise(async(resolve, reject) => {
            var options = {
                'method': 'POST',
                'url': 'https://'+constants.ManagerURL+'/api/v3/projects/'+ProjectId+'/search',
                'headers': {
                    'Authorization': 'Bearer ' + constants.QTEST_TOKEN,
                    'Accept-Type': 'application/json',
                    'Content-Type': 'application/json'
                },
                'body': JSON.stringify({
                    "object_type": "test-cases",
                    "fields": [
                        "*"
                    ],
                    "query": "'Automation Content' = '" + AutomationContent + "'"
                })
            };
            request(options, function (error, response) {
                if (error) {
                    console.log('[ERROR] (searchForTestCase):' + error);
                    return reject(error);
                } else {
                    console.log('[DEBUG] (searchForTestCase) Response Body: ' + response.body);
                    return resolve(response.body);
                }
            });
        });
    };

	const createTestRun = async(ProjectId, testSuiteId, testCaseId, testRunPayload, testCasePayload) => {
        console.log('[DEBUG] (createTestRun): Executing with parameters ' + [ProjectId, JSON.stringify(testRunPayload)].join(', '));
        return await new Promise(async(resolve, reject) => {
			var newTestRunPayload = testRunPayload;
			newTestRunPayload.parentId = testSuiteId;
			newTestRunPayload.parentType = 'test-suite';
			newTestRunPayload.testCaseId = testCaseId;
            newTestRunPayload.test_case = testCasePayload;

            var options = {
				'method': 'POST',
                'url': 'https://'+constants.ManagerURL+'/api/v3/projects/'+ProjectId+'/test-runs?parentId='+testSuiteId+'&parentType=test-suite',
                'headers': {
                'Authorization': 'Bearer ' + constants.QTEST_TOKEN,
                'Accept-Type': 'application/json',
                'Content-Type': 'application/json'
                },
                body: JSON.stringify(newTestRunPayload)
            };
            console.log('[DEBUG] (createTestRun) Request: ' + JSON.stringify(newTestRunPayload));
            request(options, function (error, response) {
                if (error) {
                    console.log('[ERROR] (createTestRun):' + JSON.stringify(error));
                    return reject(error);
                } else {
                    console.log('[DEBUG] (createTestRun) Response: ' + JSON.stringify(response));
                    console.log('[DEBUG] (createTestRun) Response Body: ' + response.body);
                    let responseObject = JSON.parse(response.body);
                    return resolve(responseObject.id);
                }
            });
        });
    }
	
	const createTestLog = async(ProjectId, testcasePayload, testRunId) => {
        console.log('[DEBUG] (createTestLog): Executing with parameters ' + [ProjectId, JSON.stringify(testcasePayload), testRunId].join(', '));
        return await new Promise(async(resolve, reject) => {
            var options = {
				'method': 'POST',
                'url': 'https://'+constants.ManagerURL+'/api/v3/projects/'+ProjectId+'/test-runs/'+testRunId+'/auto-test-logs',
                'headers': {
                'Authorization': 'Bearer ' + constants.QTEST_TOKEN,
                'Accept-Type': 'application/json',
                'Content-Type': 'application/json'
                },
                body: JSON.stringify(testcasePayload)
            };
            console.log('[DEBUG] (createTestLog) Request: ' + JSON.stringify(testcasePayload));
            request(options, function (error, response) {
                if (error) {
                    console.log('[ERROR] (createTestLog):' + JSON.stringify(error));
                    return reject(error);
                } else {
                    //console.log('[DEBUG]: ' + JSON.stringify(response));
                    console.log('[DEBUG] (createTestLog): ' + response.body);
                    let responseObject = JSON.parse(response.body);
                    return resolve(responseObject.id);
                }
            });
        });
    }
  
	var payload = body;

	var testLogs = payload.logs;
	var projectId = payload.projectId;
    var testsuiteId = payload.testsuiteId;
    
	let qTestTestRunFieldValues;
	await getTestRunFieldValues(projectId).then((object) => {
		qTestTestRunFieldValues = JSON.parse(object);
		console.log('[INFO]: '+qTestTestRunFieldValues.length+' fields found.');
	}).catch((error) => {
		console.log(error);
	})

	let qTestAttachmentURLFieldId = qTestTestRunFieldValues.find(obj => obj.label === constants.NSAttachmentsURLFieldName).id;
	console.log('[DEBUG] qTestAttachmentURLFieldId: ' + qTestAttachmentURLFieldId);
	let qTestAttachmentURLFieldContent = [{
		'field_id': qTestAttachmentURLFieldId,
		'field_value': payload.attachment.attachment_url
	}]

	for (let i=0; i<testLogs.length; i++) {
		let currentTestRun = testLogs[i];
		currentTestRun.properties = qTestAttachmentURLFieldContent;
		let foundTestRun;
		let currentAutomationContent = testLogs[i].automation_content;
        console.log('[INFO]: Finding Test Runs matching ' + currentAutomationContent + '...');
		await searchForTestRun(projectId, currentAutomationContent).then(async(object) => {
			foundTestRun = JSON.parse(object);
			if (foundTestRun.items.length == 0) {
				// test run doesn't exist, create it first
                console.log('[WARN]: Test Run with matching parent ID not found!');
                console.log('[INFO]: Finding Test Case...');
                await searchForTestCase(projectId, currentAutomationContent).then(async(object) => {
                    let foundTestCase = JSON.parse(object);
                    if (foundTestCase.items.length == 0) {
                        console.log('[ERROR]: Test Case with matching Automation Content not found!  Create and/or Update in qTest.');
                    } else {
                        console.log('[INFO]: Creating Test Run...');
                        await createTestRun(projectId, testsuiteId, foundTestCase.items[0].id, currentTestRun, foundTestCase.items[0]).then(async(object) => {
                            let createdTestRunId = object;
                            console.log('[INFO]: Creating Test Log...');
                            await createTestLog(projectId, testLogs[i], createdTestRunId).then(async(object) => {
                                console.log('[INFO]: Created Test Log ' + object);
                            }
                        });
                    }
                });
			} else if (foundTestRun.items.length >= 1) {
				// test run exists, match parent
                let matchingParent = 0;
                console.log('[INFO]: Test Runs found, matching parent ID...');
                for (let r=0; r<foundTestRun.items.length; r++) {
                    if (foundTestRun.items[r].parentId == testsuiteId) {
                        console.log('[INFO]: Matching parent ID found, creating test log...');
                        // add a new log
                        matchingParent = 1;
                        let testRunId = foundTestRun.items[r].id;
                        await createTestLog(projectId, testLogs[i], testRunId).then(async(object) => {
                            console.log('[INFO]: Created Test Log ' + object);
                        }
                    }                     
                }
                if (matchingParent == 0) {
                    console.log('[WARN]: Test Run with matching parent ID not found!');
                    console.log('[INFO]: Finding Test Case...');
                    await searchForTestCase(projectId, currentAutomationContent).then(async(object) => {
                        let foundTestCase = JSON.parse(object);
                        if (foundTestCase.items.length == 0) {
                            console.log('[ERROR]: Test Case with matching Automation Content not found!  Create and/or Update in qTest.');
                        } else {
                            console.log('[INFO]: Creating Test Run...');
                            await createTestRun(projectId, testsuiteId, foundTestCase.items[0].id, currentTestRun, foundTestCase.items[0]).then(async(object) => {
                                let createdTestRunId = object;
                                console.log('[INFO]: Creating Test Log...');
                                await createTestLog(projectId, testLogs[i], createdTestRunId).then(async(object) => {
                                    console.log('[INFO]: Created Test Log ' + object);
                                }
                            });
                        }
                    });
                }
			};
		}).catch((error) => {
			console.log(error);
		});
	}
}
