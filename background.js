// Store the ID of the ChatGPT tab if it's already open
import './libs/jszip.min.js';

let chatGPTTabId = null;
let sidePanelReady = false;
// Listener for messages from sidepanel.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'openChatGPT') {
        // Check if ChatGPT tab is already open
        if (chatGPTTabId !== null) {
            // Focus the existing ChatGPT tab
            chrome.tabs.update(chatGPTTabId, { active: true });
        } else {
            // Create a new ChatGPT tab if not already open
            chrome.tabs.create({ url: 'https://chat.openai.com/' }, (tab) => {
                chatGPTTabId = tab.id; // Store the newly opened tab's ID
            });
        }
        setTimeout(() => {
            // Inject the extracted data into the ChatGPT input field
            chrome.scripting.executeScript({
                target: { tabId: chatGPTTabId },
                func: pasteTextIntoChatGPT,
                args: [message.data] // Pass the extracted result text
            });
        }, 3000);
        sendResponse({ status: 'Injecting data into ChatGPT' });
    } else if (message.action === "startDownloadProcess") {
        sendResponse({ type: 'test', data: 'Download process started.' });
        // Load the download summary page in the current tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                const currentTab = tabs[0];
                sendResponse({ type: 'success', message: 'Download process started.' });
                chrome.tabs.update(currentTab.id, { url: 'https://secure.mypennmedicine.org/MyPennMedicine/app/record-download/download-summary?selectionType=singleVisit&visitID=0' }, () => {
                    // Add listener to initiate download when the page is fully loaded
                    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
                        if (tabId === currentTab.id && changeInfo.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            initiateDownload(tabId);
                        }
                    });
                });
            }
        });
    } else if (message.action === 'sidePanelReady') {
        sidePanelReady = true;
        sendResponse({ status: 'Acknowledged side panel ready' });
    }
    return true;
});

// Function to paste text into ChatGPT's input field
function pasteTextIntoChatGPT(data) {
    const text = String(data);
    const inputBox = document.querySelector('div[contenteditable="true"].ProseMirror#prompt-textarea');
    
    if (inputBox) {
        inputBox.innerText = text; // Set the value
        inputBox.dispatchEvent(new Event('input', { bubbles: true })); // Trigger input event

        setTimeout(() => {
            inputBox.dispatchEvent(new KeyboardEvent('keydown', {
                bubbles: true,
                cancelable: true,
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
            }));

            chrome.runtime.sendMessage({ action: 'removeLoadingMessage' });
        }, 500);
    }
}

// Listener for tab removal to reset ChatGPT tab ID
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === chatGPTTabId) {
        chatGPTTabId = null; // Reset the stored ID when the ChatGPT tab is closed
    }
});

function initiateDownload(tabId) {
    updateLoadingMessage('Requesting download of visit record...');
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
            // Function to wait for the content and click the "Request download" button using Promises
            function waitForContentAndClickButton(attempts = 10) {
                return new Promise((resolve) => {
                    // Internal function to retry finding and clicking the button
                    function tryClickButton(remainingAttempts) {
                        // Attempt to find the "Request download" button
                        const button = document.querySelector("#appRoot > div > div > div._Segment._container.boundary-none.buttonFlexer > button");

                        if (button && button.textContent.includes('Request download')) {
                            // Scroll into view and click the button
                            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            // Uncomment this line when ready to actually click
                            button.click();
                            resolve(true); // Signal success
                        } else if (remainingAttempts > 0) {
                            // Log that the button was not found and try again after a short delay
                            console.log(`Button not found. Retrying... Attempts left: ${remainingAttempts}`);
                            setTimeout(() => tryClickButton(remainingAttempts - 1), 1000); // Retry after 1 second
                        } else {
                            console.error('Request download button not found after multiple attempts.');
                            resolve(false); // Signal failure after all attempts
                        }
                    }

                    // Start the attempt to find and click the button
                    tryClickButton(attempts);
                });
            }

            // Start the function and return the promise
            return waitForContentAndClickButton();
        }
    }, (results) => {
        // After the content script runs, check the result
        if (results && results[0]?.result) {
            // Navigate directly to the desired page if the button click was successful
            chrome.tabs.update(tabId, { url: 'https://secure.mypennmedicine.org/MyPennMedicine/documents/released' });
            monitorFinalDownload(tabId); 
        } else {
            console.error('Failed to click the button or navigate to the desired page.');
        }
    });
}


// Function to monitor the final download page for the most recent "Download" button
function monitorFinalDownload(tabId) {
    updateLoadingMessage('Waiting for the download preparation to complete! Please do not interact with the page.');
    let attempts = 0;
    const maxAttempts = 30; // Approximately 2.5 minutes of waiting
    const checkInterval = 3000; // Check every 3 seconds
    const refreshThreshold = 5; // Refresh the page every 5 attempts

    const intervalId = setInterval(() => {
        attempts++;

        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                // Select the first card with class "card col-6 withButton"
                const firstCard = document.querySelector('#ROIList .card.col-6.withButton');
                
                if (firstCard) {
                    // Check if the first card has a download button
                    const downloadButton = firstCard.querySelector('.button.downloadROI.completeworkflow');

                    // If a download button is found, return true
                    return downloadButton ? true : false;
                }
                
                return false; // Signal that the button is not found yet
            }
        }, (results) => {
            if (results[0]?.result) {
                // If the download button is found, stop checking and click the button
                clearInterval(intervalId);
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: () => {
                        // Click the download button inside the first card
                        const firstCard = document.querySelector('#ROIList .card.col-6.withButton');
                        if (firstCard) {
                            const downloadButton = firstCard.querySelector('.button.downloadROI.completeworkflow');
                            if (downloadButton) {
                                downloadButton.click(); // Click the button
                                updateLoadingMessage('Downloading the visit record...');
                            }
                        }
                    }
                }, () => {
                    // After clicking the download button, handle the popup
                    handleDownloadPopup(tabId);
                });
            } else if (attempts % refreshThreshold === 0) {
                // Refresh the page every `refreshThreshold` attempts
                chrome.tabs.reload(tabId, {}, () => {
                    console.log(`Page refreshed after ${attempts} attempts to find the download button.`);
                });
            } else if (attempts >= maxAttempts) {
                clearInterval(intervalId);
                console.error('The most recent "Download" button is taking too long to appear.');
            }
        });
    }, checkInterval);
}

function handleDownloadPopup(tabId) {
    let popupAttempts = 0;
    const maxPopupAttempts = 20; // Approximately 1.5 minutes of waiting
    const popupCheckInterval = 3000; // Check every 3 seconds

    const popupIntervalId = setInterval(() => {
        popupAttempts++;
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                // Find the "Download" button within the popup
                const popupDownloadButton = document.querySelector('.records-disclaimer .button.completeworkflow');

                // Return true if the button is found and ready to be clicked
                return popupDownloadButton ? true : false;
            }
        }, (results) => {
            if (results[0]?.result) {
                clearInterval(popupIntervalId);
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: () => {
                        // Click the "Download" button inside the popup
                        const popupDownloadButton = document.querySelector('.records-disclaimer .button.completeworkflow');
                        if (popupDownloadButton) {
                            popupDownloadButton.click(); // Click the button
                        }
                    }
                });
            } else if (popupAttempts >= maxPopupAttempts) {
                clearInterval(popupIntervalId);
                console.error('The "Download" button in the popup is taking too long to appear.');
            }
        });
    }, popupCheckInterval);
}
chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state && delta.state.current === 'complete') {
        chrome.downloads.search({ id: delta.id }, (results) => {
            if (results.length && results[0].filename.endsWith('.zip')) {
                const downloadItem = results[0];
                updateLoadingMessage('Extracting recent test results and sending to ChatGPT...');
                // Process the ZIP file to extract the PDF
                readAndProcessZipFile(downloadItem.id);
                
            }
        });
    }
});

async function readAndProcessZipFile(downloadId) {

    try {
        const results = await new Promise((resolve, reject) => {
            chrome.downloads.search({ id: downloadId }, (res) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(res);
                }
            });
        });

        if (results.length && results[0]) {
            const fileUrl = results[0].url;

            // Fetch the file as a Blob and convert to ArrayBuffer
            const response = await fetch(fileUrl);
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();

            // Use JSZip to load and unzip the ArrayBuffer
            const zip = await JSZip.loadAsync(arrayBuffer);

            // Extract paths and necessary content from INDEX.HTM
            if (zip.file('INDEX.HTM')) {
                const indexHtmlContent = await zip.file('INDEX.HTM').async('text');

                // Extract paths using INDEX.HTM content
                const xmlFilePaths = extractFilePaths(indexHtmlContent);
                const xmlData = {};
                // Process XML files incrementally
                for (const filePath of xmlFilePaths) {
                    if (zip.file(filePath)) {
                        const xmlBlob = await zip.file(filePath).async('blob');
                        
                        const base64Data = await blobToBase64(xmlBlob);
                        xmlData[filePath] = base64Data; // Store the base64 string
                        
                    } else {
                        console.warn(`File ${filePath} not found in ZIP.`);
                    }
                }
                storeXmlData(xmlData);
            } else {
                console.warn('INDEX.HTM not found in ZIP file.');
            }
        } else {
            console.error('Could not find the downloaded file with ID:', downloadId);
        }
    } catch (error) {
        console.error('Error during ZIP file reading process:', error);
    }
}

function extractFilePaths(indexHtmlContent) {
    const filePathSpanRegex = /<span class="FilePath">([\s\S]*?)<\/span>/i;
    const filePathMatch = filePathSpanRegex.exec(indexHtmlContent);

    if (!filePathMatch) {
        console.warn('File paths not found in INDEX.HTM.');
        return [];
    }

    const filePathContent = filePathMatch[1];
    const fileLines = filePathContent.split('<br />');
    const filePaths = [];
    const pathRegex = /IHE_XDM &gt; ([^&]+) &gt; Patient Health Summary file: (DOC\d+\.XML)/i;

    for (const line of fileLines) {
        const match = pathRegex.exec(line.trim());
        if (match) {
            const dirName = match[1];
            const fileName = match[2];
            const fullPath = `IHE_XDM/${dirName}/${fileName}`;
            filePaths.push(fullPath);
        }
    }

    return filePaths;
}
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Function to store all XML data in local storage and send a single message to the side panel
function storeXmlData(xmlData) {
    chrome.storage.local.set({ allXmlData: xmlData }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error storing XML data:', chrome.runtime.lastError);
        } else {
            // Notify the side panel that all data is ready
            sendMessageToSidePanel();
        }
    });
}

function updateLoadingMessage(progressMessage) {
    chrome.runtime.sendMessage({ action: 'updateLoadingMessage', message: progressMessage });
}

function sendMessageToSidePanel() {
    if (sidePanelReady) {
        chrome.runtime.sendMessage({ action: 'allXmlDataStored' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error sending message to side panel:', chrome.runtime.lastError);
            } else {
                console.log('Message sent successfully to side panel indicating all XML data is ready');
            }
        });
    } else {
        // If side panel is not ready, wait and try again
        setTimeout(sendMessageToSidePanel, 500);
    }
}


