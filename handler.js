'use strict'
const {google} = require('googleapis');

const credentials = {
    //drive creds here
};

const accessToken = {
    //drive token here
};

const parentFolder = '12punsZgqg3C2YodgmJxpV6QRO9C0-AB3';

module.exports.aliceread = async request => {
    try {
        let parsedAliceRequest = JSON.parse(request.body);
        const authorizedClient = authorize(credentials);
        const statusFileId = await getStatusFileId(authorizedClient);
        const statusContent = await readFile(authorizedClient, statusFileId);

        if (parsedAliceRequest.session.message_id === 0) {
            console.log("Read the book?");
            return aliceResponse(parsedAliceRequest, "Читать книгу " + statusContent.name + " ?", ["да", "читай", "нет"]);
        }
        if (stopReading(parsedAliceRequest)) {
            console.log("Stop read the book");
            return aliceResponse(parsedAliceRequest, "Закончили читать", null, true);
        }

        const currentPosition = statusContent.current;

        statusContent.current = currentPosition + 1;
        updateStatusFile(authorizedClient, statusFileId, statusContent);
        let bookPart = await getBookFileContent(authorizedClient, currentPosition);

        if (currentPosition === statusContent.total) {
            console.log("Book finished");
            return aliceResponse(request, bookPart + " Книга закончилась! Нужно закачать новую.", null, true);
        } else {
            console.log("Read next part?");
            return aliceResponse(request, bookPart + " Читать дальше?", ["дальше", "стоп"]);
        }
    } catch (err) {
        console.log(err);
        return aliceResponse(request, "В навыке ошибка! Нужно исправлять", null, true);
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

function aliceResponse(parsedAliceRequest, text, hints, finishSession) {
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
        response: {
            text: text,
            buttons: buttons,
            end_session: finishSession,
        },
    };
    aliceResponseBody = JSON.stringify(aliceResponseBody);
    return {
        statusCode: 200,
        body: aliceResponseBody,
        headers: {
            'Content-Type': 'application/json',
        }
    };
}

function authorize(credentials) {
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(accessToken);
    return oAuth2Client;
}

function updateStatusFile(auth, fileId, content) {
    const drive = google.drive({version: 'v3', auth});
    const media = {
        mimeType: 'application/json',
        body: content,
    };
    drive.files.update({
        fileId: fileId,
        media: media
    });
}

function getBookFileContent(auth, currentPosition) {
    const drive = google.drive({version: 'v3', auth});
    return drive.files.list({
        q: "'google parent folder here' in parents and name='" + currentPosition + ".txt'",
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
        q: "'google parent folder here' in parents and name='status.json'",
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