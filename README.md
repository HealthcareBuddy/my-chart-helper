# MyChart Test Result Chrome Extension

This Chrome extension interacts with MyPennMedicine to download medical documents and opens a ChatGPT tab to assist users with their latest test results. The extension provides a side panel interface where users can initiate the download process, and it updates the loading message to convey progress information.

## Features

- Download summary of most recent visit data
- Display progress updates to user via loading message
- Automatically open ChatGPT and paste and extract data for assistance

## Installation

1.Clone the repository or download the source code.
2.Open Google Chrome and go to chrome://extensions/.
3.Enable “Developer mode” using the toggle in the top right corner.
4.Click “Load unpacked” and select the directory where you downloaded or cloned the extension.

## Files

- **sidepanel.html**: The HTML file for the side panel interface
- **sidepanel.js**: The JavaScript file handling the side panel’s logic and communication with the background script
- **background.js**: The background script that manages the core functionality of downloading documents and interacting with ChatGPT

## How to Use

1. Click on the extension icon to open the side panel.
2. Click the "Chat with Latest Test Results" button.
3. The extension will start the downloading process, and the loading message will display updates.
4. Once the process is complete, ChatGPT will open with your test results.
