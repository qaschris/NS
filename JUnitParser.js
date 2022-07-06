const PulseSdk = require('@qasymphony/pulse-sdk');
const request = require('request');
const xml2js = require('xml2js');
const { Webhooks } = require('@qasymphony/pulse-sdk');

exports.handler = function ({ event: body, constants, triggers }, context, callback) {
    function emitEvent(name, payload) {
        let t = triggers.find(t => t.name === name);
        return t && new Webhooks().invoke(t, payload);
    };

    function htmlEntities(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
                
        var payload = body;
        var projectId = payload.projectId;
        var testsuiteId = payload.testsuiteId;
        var testLogs = [];
        let cycleName;

        let testResults = Buffer.from(payload.result, 'base64').toString('utf8');

        //console.log(testResults);

        var parseString = require('xml2js').parseString;
        var startTime = '';
        var endTime = '';
        var lastEndTime = 0;

        parseString(testResults, {
            preserveChildrenOrder: true,
            explicitArray: false,
            explicitChildren: false,
            emptyTag: "..."
        }, function (err, result) {
            if (err) {                
                console.log('[ERROR]: Unexpected Error Parsing XML Document: ' + err);
            } else {              
                if (result.testsuites) {                    
                    if (result.testsuites.testsuite) {
                        var testsuites = Array.isArray(result.testsuites['testsuite']) ? result.testsuites['testsuite'] : [result.testsuites['testsuite']];
                        testsuites.forEach(function(testsuite) {
                            lastEndTime = 0;
                            suiteName = testsuite.$.name;
                            console.log('[INFO]: Suite Name: ' + suiteName)
                            if (testsuite.testcase) {
                                var testcases = Array.isArray(testsuite.testcase) ? testsuite.testcase : [testsuite.testcase];
                                testcases.forEach(function(testcase) {
                                    var classArray = [];
                                    classArray = testcase.$.name.replace('=>', ':').split(':');
                                    var depth = classArray.length;
                                    var className = classArray[(depth - 1)];
                                    var moduleNames = [];
                                    var moduleCount = 0;
                                    classArray.forEach(function(folder) {
                                        if(moduleCount < (depth - 1)) {
                                            moduleNames.push(folder.trim());
                                            moduleCount++;
                                        }
                                    })
                                    if (moduleNames.length == 0) {
                                        moduleNames.push(suiteName);
                                    }
                                    console.log('[INFO]: Case Name: ' + className)
                                    var classStatus = 'passed';
                                    if (lastEndTime == 0) {
                                        startTime = new Date(Date.parse(testsuite.$.timestamp)).toISOString();
                                    } else {
                                        startTime = lastEndTime;
                                    }
                                    interim = new Date(Date.parse(startTime)).getSeconds() + parseFloat(testcase.$.time);
                                    endTime = new Date(Date.parse(startTime)).setSeconds(interim);
                                    endTime = new Date(endTime).toISOString();

                                    var note = '';
                                    var stack = '';
                                    var testFailure = Array.isArray(testcase.failure) ? testcase.failure : [testcase.failure];
                                    testFailure.forEach(function(failure) {
                                        if (failure) {
                                            console.log('[INFO]: ' + failure.$.type)
                                            note = failure.$.type + ': ' + failure.$.message;
                                            console.log('[INFO]: ' + failure._)
                                            stack = failure._;
                                            classStatus = 'failed';
                                        }
                                    });
        
                                    var testError = Array.isArray(testcase.error) ? testcase.error : [testcase.error];
                                    testError.forEach(function(error) {
                                        if (error) {
                                            console.log('[INFO]: ' + error.$.message)
                                            note = error.$.message;
                                            classStatus = 'failed';
                                        }
                                    });
        
                                    var testSkipped = Array.isArray(testcase.skipped) ? testcase.skipped : [testcase.skipped];
                                    testSkipped.forEach(function(skipped) {
                                        if (skipped) {
                                            classStatus = 'skipped';
                                        }
                                    });

                                    console.log('[INFO]: ' + classStatus);

                                    if (classStatus !== 'skipped') {
                                        var testLog = {
                                            status: classStatus,
                                            name: className,
                                            attachments: [],
                                            note: note,
                                            exe_start_date: startTime,
                                            exe_end_date: endTime,
                                            automation_content: htmlEntities(className),
                                            module_names: [cycleName, suiteName]
                                        };
                                        if (stack !== '') {
                                        testLog.attachments.push({
                                            name: `${className}.txt`,
                                            data: Buffer.from(stack).toString("base64"),
                                            content_type: "text/plain"
                                        });
                                        }
                                        testLogs.push(testLog);
                                    } else {
                                        console.log('[WARN]: Current test status of SKIPPED, test is not added to results collection.');
                                    }
                                    lastEndTime = endTime;
                                });
                            } else {                                
                                console.log('[WARN]: Test Suite has no Test Cases, skipping.');
                            }
                        });
                    } else {
                        console.log('[WARN]: Test Suites collection is empty, skipping.');
                    }
                } else {
                    console.log('[INFO]: Test Suites collection doesn\'t exist, checking for singular test suite.');
                    var testsuite = result.testsuite;

                    lastEndTime = 0;
                    suiteName = testsuite.$.name;
                    console.log('[INFO]: Suite Name: ' + suiteName);
                    if (testsuite.testcase) {
                        var testcases = Array.isArray(testsuite.testcase) ? testsuite.testcase : [testsuite.testcase];
                        testcases.forEach(function(testcase) {
                            let className = testcase.$.name;
                            let moduleNames = testcase.$.classname.split('.');
                            console.log('[INFO]: Module Name: ' + moduleNames);
                            cycleName = moduleNames[1].split('_')[0];
                            let suiteName = moduleNames[2];
                            console.log('[INFO]: Case Name: ' + className);
                            var classStatus = 'passed';
                            if(lastEndTime == 0) {
                                startTime = new Date(Date.parse(testsuite.$.timestamp)).toISOString();
                            } else {
                                startTime = lastEndTime;
                            }
                            interim = new Date(Date.parse(startTime)).getSeconds() + parseFloat(testcase.$.time);
                            endTime = new Date(Date.parse(startTime)).setSeconds(interim);
                            endTime = new Date(endTime).toISOString();

                            var note = '';
                            var stack = '';
                            
                            var testFailure = Array.isArray(testcase.failure) ? testcase.failure : [testcase.failure];
                            testFailure.forEach(function(failure) {
                                if (failure) {
                                    console.log('[INFO]: ' + failure.$.type)
                                    note = failure.$.type + ': ' + failure.$.message;
                                    console.log('[INFO]: ' + failure._)
                                    stack = failure._;
                                    classStatus = 'failed';
                                }
                            });

                            var testError = Array.isArray(testcase.error) ? testcase.error : [testcase.error];
                            testError.forEach(function(error) {
                                if (error) {
                                    console.log('[INFO]: ' + error.$.message)
                                    note = error.$.message;
                                    classStatus = 'failed';
                                }
                            });

                            var testSkipped = Array.isArray(testcase.skipped) ? testcase.skipped : [testcase.skipped];
                            testSkipped.forEach(function(skipped) {
                                if (skipped) {
                                    classStatus = 'skipped';
                                }
                            });

                            console.log('[INFO]: ' + classStatus);

                            if (classStatus !== 'skipped') {
                                var testLog = {
                                    status: classStatus,
                                    name: className,
                                    attachments: [],
                                    note: note,
                                    exe_start_date: startTime,
                                    exe_end_date: endTime,
                                    automation_content: htmlEntities(className),
                                    module_names: [cycleName, suiteName]
                                };
                                if (stack !== '') {
                                testLog.attachments.push({
                                    name: `${className}.txt`,
                                    data: Buffer.from(stack).toString("base64"),
                                    content_type: "text/plain"
                                });
                                }
                                testLogs.push(testLog);
                            } else {
                                console.log('[WARN]: Current test status of SKIPPED, test is not added to results collection.');
                            }
                            lastEndTime = endTime;
                        });
                    } else {
                        console.log('[WARN]: Test Suite has no Test Cases, skipping.');
                    }
                }
            }   
        });

        if (testLogs.length > 0) {
            var formattedResults = {
                "projectId": projectId,
                "testsuiteId": testsuiteId,
                "logs": testLogs,
                "attachment": payload.attachment
            };
    
            emitEvent('NSProcessAttachments', formattedResults);
        } else {
            console.log('[ERROR]: No test cases selected for Ranorex RunConfig.  Please correct in Ranorex and run again.');
        }

};
