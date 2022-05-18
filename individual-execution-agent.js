const cp = require('child_process');
// This script requires the 'request' node.js module.
// This section grabs required node modules not packaged with
// the Automation Host service prior to executing the script.
const req = async module => {
  try {
    require.resolve(module);
  } catch (e) {
    console.log(`=== could not resolve "${module}" ===\n=== installing... ===`);
    cp.execSync(`npm config set strict-ssl=false`);
    cp.execSync(`npm config set registry http://registry.npmjs.org/`);
    cp.execSync(`npm install ${module}`);
    console.log(`=== "${module}" has been installed ===`);
  }
  console.log(`=== requiring "${module}" ===`);
  try {
    return require(module);
  } catch (e) {
    console.log(`=== could not include "${module}" ===`);
    console.log(e);
    process.exit(1);
  }
}

const formatSizeUnits = async (bytes) => {
    if (bytes > 0) {
        bytes = (bytes / 1048576).toFixed(4); 
    } else {
        bytes = 0;
    }
    return bytes;
}

const main = async () => {

    const { execSync } = await req("child_process");
    const fs = await req('fs');
    const path = await req('path');
    const request = await req('request');
    
    const pulseUri = 'https://pulse-7.qtestnet.com/webhook/721bc940-e8f6-427f-b668-3b86ef064136';                                // Pulse parser webhook endpoint
    const ranorexProjectDir = 'C:\\Users\\chrpe\\Documents\\Repository\\Tricentis.Pulse.Integrations\\NSCorp';                       // Ranorex project directory (e.g.: C:\RanorexProject\bin\Debug)
    const ranorexProjectExecutable = 'C:\\Users\\chrpe\\Documents\\Repository\\Tricentis.Pulse.Integrations\\NSCorp';                // Ranorex executable name (e.g.: RxDatabase.exe)
    const reportDir = `${ranorexProjectDir}\\Reports`;  // Ranorex reports directory

    // Build command line for test execution.  Place any scripts surrounding build/test procedures here.
    // Comment out this section if build/test execution takes place elsewhere.    
    
    const uploadResults = async () => {
        let junit = '';
        let rxzlog = '';
        let junitFilename = '';
        let rxzlogFilename = '';
        
        try {
            // find rxzlog and junit.xml files and sort them latest first
            let files = fs.readdirSync(reportDir)
                .filter(x => x.endsWith('.rxzlog') || x.endsWith('.junit.xml'))
                .map(file => ({ file, ctime: fs.lstatSync(path.join(reportDir, file)).mtime }))
                .sort((a, b) => b.ctime.getTime() - a.ctime.getTime());

            // find latest junit and rxzlog
            junitFilename = files.find(x => x.file.endsWith('.junit.xml')).file;
            rxzlogFilename = files.find(x => x.file.endsWith('.rxzlog')).file;
            
            // read file contents
            junit = fs.readFileSync(path.join(reportDir, junitFilename), 'utf8');
            rxzlog = fs.readFileSync(path.join(reportDir, rxzlogFilename), 'utf8');

            console.log('=== read results file successfully ===');
        } catch(e) {
            console.log('=== error: ', e.stack, ' ===');
        }

        let payloadBody = {}
        let testrunList = JSON.parse($TESTRUNS_LIST);

        if(testrunList.length === 0) {
            // manual execution (Automation Host)
            payloadBody = {
                'projectId': process.env.PROJECT_ID,
                'result': Buffer.from(junit).toString('base64'),     // convert to base64
            };
        } else {
            // scheduled (qTest)
            let testsuiteId = testrunList[0].parentId;
            payloadBody = {
                'projectId': process.env.PROJECT_ID,
                'testsuiteId': testsuiteId,
                'result': Buffer.from(junit).toString('base64'),     // convert to base64
                'attachment': {
                    'name': rxzlogFilename,
                    'content_type': 'application/zip',
                    'data': Buffer.from(rxzlog).toString('base64')
                }
                //'rxzlog': Buffer.from(rxzlog).toString('base64')    // convert to base64
            };
        }

        let bufferSize = await formatSizeUnits(Buffer.byteLength(JSON.stringify(payloadBody), 'ascii'));

        console.log('=== info: payload size is ' + bufferSize + ' MB ===');
        if (bufferSize > 50) {
            console.log('=== error: payload size is greater than 50 MB cap, exiting ===');
            process.exit();
        }

        // establish the options for the webhook post to Pulse parser
        let uploadOpts = {
            url: pulseUri,
            json: true,
            body: payloadBody,
            followAllRedirects: true
        };
        
        console.log(`=== uploading results... ===`)
        return new Promise( (resolve, reject) => {
            request.post(uploadOpts, function (err, response, resbody) {
                if (err) {
                    console.log('=== error: ' + err + ' ===');
                    reject(err);
                } else if (response.statusCode > 299) {                    
                    console.log('=== error: ' + response.body.substring(response.body.lastIndexOf("<pre>") + 5, response.body.lastIndexOf("</pre>")) + ' ===');
                    reject(response.body.substring(response.body.lastIndexOf("<pre>") + 5, response.body.lastIndexOf("</pre>")));
                } else {
                    for (let triggeredAction of response.body) {
                        console.log('=== status: ' + triggeredAction.status + ', execution id: ' + triggeredAction.id + ' ===');
                    }
                    resolve("Uploaded results successfully.");
                }
            });
        });
    }

    let testrunList = JSON.parse($TESTRUNS_LIST);
    let testsuiteId = testrunList[0].parentId;
    
    let opts = {
        url: `${process.env.QTEST_URL}/api/v3/projects/${process.env.PROJECT_ID}/test-suites/${testsuiteId}`,
        headers: {
            'Authorization': process.env.AUTH_TOKEN
        }
    };
    
    let runConfig = await new Promise(function(resolve, reject) {
        request.get(opts, function (err, response, resbody) {
            if (err) {
                console.log('=== error: ' + err + ' ===');
                reject(err);
            } else if (response.statusCode > 299) {                    
                console.log('=== error: ' + response.body.substring(response.body.lastIndexOf("<pre>") + 5, response.body.lastIndexOf("</pre>")) + ' ===');
                reject(response.body.substring(response.body.lastIndexOf("<pre>") + 5, response.body.lastIndexOf("</pre>")));
            } else {
                const body = JSON.parse(resbody);
                let field_value_name = body.properties.find(x => x.field_name === 'Ranorex Run Config').field_value_name;
                resolve(field_value_name);
            }
        })
    });

    if($TESTCASES_AC)
    {
        let testcases = $TESTCASES_AC.split(',');

        process.chdir(ranorexProjectDir)
        for (const testcase of testcases) {
            let command = `"${ranorexProjectExecutable}" /testcase:${testcase} /runconfig:${runConfig} /junit /zipreport`;
            
            console.log(`=== executing command ===`);
            try {
                console.log(command);
                execSync(command, {stdio: "inherit"});
            } catch(e) {
                console.log('=== error: ', e.stack, ' ===');
            }
            console.log(`=== command completed ===`);
    
            await uploadResults();
        }
    } else {
        process.chdir(ranorexProjectDir)
        let command = `"${ranorexProjectExecutable}" /runconfig:${runConfig} /junit /zipreport`;
        
        console.log(`=== executing command ===`);
        try {
            console.log(command);
            execSync(command, {stdio: "inherit"});
        } catch(e) {
            console.log('=== error: ', e.stack, ' ===');
        }
        console.log(`=== command completed ===`);

        await uploadResults();
    }
};

main();
