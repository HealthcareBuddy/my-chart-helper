document.addEventListener('DOMContentLoaded', () => {
  // Add event listener to the button in the side panel
  const chatButton = document.getElementById('chatButton');
  if (chatButton) {
    chatButton.addEventListener('click', startDownloadProcess);
  }

  // Add listener for messages from the background script
  chrome.runtime.onMessage.addListener(handleMessage);

  // Notify background script that side panel is ready
  notifyBackgroundScriptReady();
});


function startDownloadProcess() {
  document.getElementById('loadingMessage').style.display = 'block';
  
  chrome.runtime.sendMessage({ action: 'startDownloadProcess' }, response => {
    if (chrome.runtime.lastError) {
      console.error('Error sending message:', chrome.runtime.lastError);
    } else if (response) {
      if (response.type === 'success') {
        console.log('Message sent to background script to start download process.');
      } else if (response.type === 'test') {
        console.log('Test message received inside response:', response.data);
      }
    } else {
      console.log('No response received from background script.');
    }
  });
}

function handleMessage(message, sender, sendResponse) {
  console.log('Message received in sidepanel:', message);

  if (message.action === 'updateLoadingMessage') {
    const loadingMessage = document.getElementById('loadingMessage');
    if (loadingMessage) {
        loadingMessage.textContent = message.message; // Update the loading message
    }
  } else if (message.action === 'pdfBlobStored') {
    // Retrieve the stored PDF blob data from chrome.storage.local
    chrome.storage.local.get('pdfBlobData', (result) => {
      const base64Data = result.pdfBlobData;
      console.log('Retrieved PDF data from storage:', base64Data);

      if (!base64Data) {
        console.error('No PDF data found in storage.');
        sendResponse({ status: 'Error: No PDF data found' });
        return;
      }

      // Convert base64 string back to a Blob and display it
      displayPdfFromBase64(base64Data);

      // Clear the data from storage after use to avoid buildup
      chrome.storage.local.remove('pdfBlobData', () => {
        if (chrome.runtime.lastError) {
          console.error('Error clearing PDF data from storage:', chrome.runtime.lastError);
        } else {
          console.log('PDF data cleared from storage.');
        }
      });

      sendResponse({ status: 'PDF displayed successfully' });
    });
    return true; // Indicate async response
  } else if (message.action === 'removeLoadingMessage') {
    // Handle remove loading message action
    const loadingMessage = document.getElementById('loadingMessage');
    if (loadingMessage) {
      loadingMessage.style.display = 'none';
    }
    console.log('Handling remove loading message action.');
    sendResponse({ status: 'Loading message removed' });
  } else if (message.action ==='allXmlDataStored') {
      chrome.storage.local.get('allXmlData', (result) => {
        const xmlData = result.allXmlData;
        console.log('Retrieved all XML data from storage:', xmlData);
        
        if (!xmlData || Object.keys(xmlData).length === 0) {
            console.error('No XML data found in storage.');
            sendResponse({ status: 'Error: No XML data found' });
            return;
        }

        let allExtractedResults = '';

        // Process each XML file's data
        for (const [fileName, base64Data] of Object.entries(xmlData)) {
            // Decode and parse XML, then extract results
            const extractedResults = processXmlFile(base64Data, fileName);
            allExtractedResults += `Results from ${fileName}:\n${extractedResults}\n\n`;
        }

        // Clear the data from storage after use to avoid buildup
        chrome.storage.local.remove('allXmlData', () => {
            if (chrome.runtime.lastError) {
                console.error('Error clearing XML data from storage:', chrome.runtime.lastError);
            } else {
                console.log('All XML data cleared from storage.');
            }
        });

        chrome.runtime.sendMessage({ action: 'openChatGPT', data: allExtractedResults }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error sending message to background script:', chrome.runtime.lastError);
            } else {
                console.log('Sent message to background script to open ChatGPT:', response);
            }
        });

      sendResponse({ status: 'All results processed and sent to background script' });
    });
    return true; // Indicate async response
  }

  sendResponse({ status: 'Message handled in sidepanel' });
  return true; // Indicate async response
}

function displayPdfFromBase64(base64Data) {
  // Convert base64 string to a Blob
  const byteCharacters = atob(base64Data);
  const byteArray = new Uint8Array([...byteCharacters].map(char => char.charCodeAt(0)));
  const blob = new Blob([byteArray], { type: 'application/pdf' });
  const blobUrl = URL.createObjectURL(blob);

  // Display the PDF using the Blob URL in an iframe
  const iframe = document.createElement('iframe');
  iframe.src = blobUrl;
  iframe.width = '100%';
  iframe.height = '800px';  // Adjust height as needed for long PDFs
  document.body.appendChild(iframe);

  // Revoke the Blob URL when done to free up memory
  iframe.onload = () => URL.revokeObjectURL(blobUrl);
}

function notifyBackgroundScriptReady() {
  chrome.runtime.sendMessage({ action: 'sidePanelReady' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error notifying background script:', chrome.runtime.lastError);
    } else {
      console.log('Notified background script that side panel is ready:', response);
    }
  });
}

function processXmlFile(base64Data, fileName) {
  // Decode base64 string to text
  const decodedData = atob(base64Data);

  // Parse the XML string into an XML document
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(decodedData, 'text/xml');

  // Extract results from the XML document
  const extractedResults = extractAllResultsFromXML(xmlDoc);

  return extractedResults;
}

function extractAllResultsFromXML(xmlDoc, maxCaptions = 10, maxChars = 5000) {
  // Locate the "Results" section
  const resultsSections = xmlDoc.getElementsByTagName('section');
  let extractedData = '';
  let captionCount = 0;
  let charCount = 0;

  for (let section of resultsSections) {
    const title = section.getElementsByTagName('title')[0]?.textContent || '';
    if (title === 'Results') {
      // Extract the relevant test data within the "Results" section
      const textElement = section.getElementsByTagName('text')[0];
      if (textElement) {
        // Extract lists, tables, and other relevant components
        const lists = textElement.getElementsByTagName('list');
        for (let list of lists) {
          const items = list.getElementsByTagName('item');
          for (let item of items) {
            // Extract captions and tables within each item
            const caption = item.getElementsByTagName('caption')[0]?.textContent || 'No Caption';
            
            // Check limits before adding the caption
            if (captionCount >= maxCaptions || charCount + caption.length > maxChars) {
              console.log('Reached limit: stopping extraction');
              return extractedData; // Stop extraction if limits are reached
            }

            extractedData += `Caption: ${caption}\n`;
            captionCount++;
            charCount += caption.length;

            const tables = item.getElementsByTagName('table');
            for (let table of tables) {
              const rows = table.getElementsByTagName('tr');
              for (let row of rows) {
                const cells = row.getElementsByTagName('td');
                const rowData = Array.from(cells).map(cell => cell.textContent.trim()).join(' | ');
                
                // Check limits before adding table data
                if (charCount + rowData.length > maxChars) {
                  console.log('Reached limit: stopping extraction');
                  return extractedData; // Stop extraction if character limit is reached
                }

                extractedData += `  ${rowData}\n`;
                charCount += rowData.length;
              }
            }
            extractedData += '\n'; // Add spacing between items
          }
        }
      }
    }
  }
  // Add prompt instructions at the end
  return addPromptInstructions(extractedData);
}

// Function to add prompt instructions to the extracted data
function addPromptInstructions(extractedData) {
  const promptInstructions = "\n\nPlease act as a medical chatbot to help me understand my test results.";
  return extractedData + promptInstructions;
}