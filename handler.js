'use strict'
const {google} = require('googleapis');
const constants = require('./constants');


module.exports.aliceread = async request => {
    try {
        let parsedAliceRequest = JSON.parse(request.body);
        console.log(request.body);
        const authorizedClient = authorize();

        if (parsedAliceRequest.session.message_id === 0) {
            const statusFileId = await getStatusFileId(authorizedClient);
            const statusContent = await readFile(authorizedClient, statusFileId);
            return aliceResponse(parsedAliceRequest, "Читать книгу " + statusContent.name + " ?", [], statusContent);
        }
        if (stopReading(parsedAliceRequest)) {
            const statusFileId = await getStatusFileId(authorizedClient);
            await updateStatusFile(authorizedClient, statusFileId, getCurrentState(parsedAliceRequest));
            return aliceResponse(parsedAliceRequest, "Закончили читать", null, {}, true);
        }

        let statusContent = getCurrentState(parsedAliceRequest);
        const currentPosition = statusContent.current;

        statusContent.current = currentPosition + 1;
        let bookPart = await getBookFileContent(authorizedClient, currentPosition);

        if (currentPosition === statusContent.total) {
            return aliceResponse(parsedAliceRequest, bookPart + " Книга закончилась! Нужно закачать новую.", [], {}, true);
        } else {
            console.log("Read next part?");
            return aliceResponse(parsedAliceRequest, bookPart + " Читать дальше?", [], statusContent);
        }
    } catch (err) {
        console.log(err);
        return aliceResponse(parsedAliceRequest, "В навыке ошибка! Нужно исправлять", null, {}, true);
    }
}

function stopReading(parsedAliceRequest) {
    let words = parsedAliceRequest.request.nlu;
    if (words && words.tokens) {
        for(let i = 0; i < words.tokens.length; i++) {
            let token = words.tokens[i];
            if (token === "нет" ||
                token === "стоп" ||
                token === "хватит" ||
                token === "закончили" ||
                token === "достаточно"
            ) {
                return true;
            }
        }
    }
    return false;
}

function aliceResponse(parsedAliceRequest, text, hints, sessionState, finishSession) {
    let aliceResponseBody;
    let buttons = [];
    if (!finishSession) {
        finishSession = false;
    }
    if (hints) {
        buttons = hints.map(
            hint => {
                return {
                    "title": hint,
                    "payload": {},
                    "hide": true
                };
            }
        )
    }

    aliceResponseBody = {
        version: parsedAliceRequest.version,
        session: parsedAliceRequest.session,
        session_state: sessionState,
        response: {
            text: text,
            buttons: buttons,
            end_session: finishSession,
        },
    };
    aliceResponseBody = JSON.stringify(aliceResponseBody);
    console.log(aliceResponseBody);
    return {
        statusCode: 200,
        body: aliceResponseBody,
        headers: {
            'Content-Type': 'application/json',
        }
    };
}

function authorize() {
    const {client_secret, client_id, redirect_uris} = constants.credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(constants.accessToken);
    return oAuth2Client;
}

function updateStatusFile(auth, fileId, content) {
    const drive = google.drive({version: 'v3', auth});
    const media = {
        mimeType: 'application/json',
        body: content,
    };
    return drive.files.update({
        fileId: fileId,
        media: media
    });
}

function getBookFileContent(auth, currentPosition) {
    const drive = google.drive({version: 'v3', auth});
    return drive.files.list({
        q: "'" + constants.parentFolder + "' in parents and name='" + currentPosition + ".txt'",
        pageSize: 1,
        fields: 'files(id)',
    }).then(
        res => {
            const files = res.data.files;
            if (files.length) {
                return files[0].id;
            } else {
                console.log('No files found.');
            }
        },
        err => console.log(err)
    ).then(
        res => readFile(auth, res),
        err => console.log(err)
    )
}

function getStatusFileId(auth) {
    const drive = google.drive({version: 'v3', auth});
    return drive.files.list({
        q: "'" + constants.parentFolder + "' in parents and name='status.json'",
        pageSize: 1,
        fields: 'files(id)',
    }).then(
        res => {
            const files = res.data.files;
            if (files.length) {
                return files[0].id;
            } else {
                console.log('No files found.');
            }
        },
        err => console.log(err)
    )
}

function getCurrentState(parsedAliceRequest) {
    return parsedAliceRequest.state.session;
}

function readFile(auth, googleFileId) {
    const drive = google.drive({version: 'v3', auth});
    return drive.files.get({
        fileId: googleFileId,
        alt: 'media'
    }).then(
        res => res.data,
        err => console.log(err)
    );
}