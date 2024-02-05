const MUT_SELECTOR = '[data-specific-auth-trigger="download"]';

const mo = new MutationObserver(onMutation);
// in case the content script was injected after the page is partially loaded
onMutation([{
    addedNodes: [document.documentElement]
}]);
observe();

function onMutation(mutations) {
    let stopped;
    for (const {
            addedNodes
        }
        of mutations) {
        for (const n of addedNodes) {
            if (n.tagName) {
                if (n.matches(MUT_SELECTOR)) {
                    stopped = true;
                    mo.disconnect();
                    replaceButton(n);
                } else if (n.firstElementChild && n.querySelector(MUT_SELECTOR)) {
                    stopped = true;
                    mo.disconnect();
                    for (const el of n.querySelectorAll(MUT_SELECTOR)) replaceButton(el);
                }
            }
        }
    }
    //    if (stopped) observe();
}

function observe() {
    mo.observe(document, {
        subtree: true,
        childList: true,
    });
}

function replaceButton(downloadButton) {
    clonedButton = downloadButton.cloneNode(true);
    clonedButton.removeAttribute('data-specific-auth-trigger');
    downloadButton.parentNode.replaceChild(clonedButton, downloadButton);

    clonedButton.addEventListener('click', downloadDocument);
    clonedButton.appendChild(spinnerDiv);
    setLoading(true);
    if (document.readyState !== 'loading') {
        initialize();
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            initialize();
        });
    }
}

let clonedButton;
let title;
let currentURL;
let urlparts;
let documentId;
let titleparts;
let titleFileExtension;
let encodedName;
let alternativeName;
let initialized = false;

async function initialize() {
    if (initialized) return;
    initialized = true;
    title = document.querySelector("h1")
        .textContent;
    currentURL = window.location.href;
    urlparts = currentURL.split('/');
    documentId = urlparts[urlparts.length - 1];
    titleparts = title.split('.');
    titleFileExtension = titleparts.length > 1 ? titleparts.pop() : null;
    //    console.log("titleFileExentsion:" + titleFileExtension);
    encodedName = titleFileExtension !== null ? documentId + "." + titleFileExtension : encodeURIComponent(title);
    alternativeName = await getDocNameAndSaveId(documentId);
    setLoading(false);
}

const spinnerDiv = document.createElement("div");
spinnerDiv.className = "download-spinner";

function setLoading(loading) {
    //    console.log("loading"+loading);
    if (loading) {
        spinnerDiv.style.display = 'block';
        clonedButton.disabled = true;
    } else {
        spinnerDiv.style.display = 'none';
        clonedButton.disabled = false;
    }
}

async function getDocInfo(docId) {
    const options = {
        headers: {
            "X-Requested-With": "XMLHttpRequest",
        },
        credentials: "omit",
    };
    const docJsonResponse = await fetch(`https://www.studydrive.net/document/${docId}`, options);
    if (docJsonResponse.ok) {
        const docJson = await docJsonResponse.json();
        return docJson;
    }
    return null;
}

async function getDocNameAndSaveId(docId) {
    let docJson = await getDocInfo(docId);
    if (docJson !== null) {
        const previewUrl = docJson["data"]["file_preview"];
        if (previewUrl !== undefined && previewUrl.startsWith("https://cdn.studydrive.net") && previewUrl.includes("token")) {
            chrome.storage.local.set({
                docId
            });
        }
        //        console.log(docJson);
        return docJson["data"]["filename"];
    }
    return null;
}

async function getToken(docId) {
    let docJson = await getDocInfo(docId);
    if (docJson !== null) {
        const previewUrl = docJson["data"]["file_preview"];
        if (previewUrl !== undefined && previewUrl.startsWith("https://cdn.studydrive.net") && previewUrl.includes("token")) {
            const previewUrlObj = new URL(previewUrl);
            const token = previewUrlObj.searchParams.get('token');
            return token;
        }
    }
    return null;
}

async function downloadDocument() {
    if (clonedButton.disabled) return;
    setLoading(true);

    chrome.storage.local.get(["docId"], async items => {

        if (items.docId === undefined) {
            alert("Please try downloading a pdf document as your first download!");
            return;
        }

        let token = await getToken(items.docId);

        let urlString = `https://cdn.studydrive.net/d/prod/documents/${documentId}/original/${encodedName}?token=${token}`;
        //        console.log(urlString);

        let fileResponse = await fetch(urlString);
        //        console.log("fileResponse");
        //        console.log(fileResponse);
        if (fileResponse.status === 404) {
            token = await getToken(items.docId);
            urlString = `https://cdn.studydrive.net/d/prod/documents/${documentId}/original/${alternativeName}?token=${token}`;
            fileResponse = await fetch(urlString);
        }
        let fileBlob = await fileResponse.blob();

        let fileURL = URL.createObjectURL(fileBlob);

        // create <a> tag dynamically
        let fileLink = document.createElement('a');
        fileLink.href = fileURL;

        // it forces the name of the downloaded file
        if (titleFileExtension === null) {
            fileLink.download = title + ".pdf";
        } else fileLink.download = title;

        // triggers the click event
        fileLink.click();

        setLoading(false);

    });
}