# 👁️ Adjudicator Workflow Monitor

## Why We Have This: Ensuring Trust and Transparency

AI agents, especially when chained together in complex workflows, can feel like a "black box." It's hard to know if they're actually doing the work, skipping steps, or getting stuck in loops. The primary goal of this monitor is to solve that problem by providing a clear, real-time window into the verification process.

This system answers critical questions:

-   **Is there any sneaky business going on?** We get to see every verification attempt, its outcome, and the feedback provided.
-   **Are we skipping stuff?** The monitor will explicitly show if a verification step was skipped (e.g., if a test plan wasn't generated).
-   **How hard was the task?** By showing the number of attempts for a given task, we can see how many tries it took the "lyin' dog" to get it right.
-   **Is the process working?** It provides immediate visual confirmation that the entire adjudication loop—from task execution to verification—is functioning as expected.

Essentially, this tool replaces suspicion with trust by making the AI's work auditable at a glance.

## What It Is: A Live Mission Control for AI Verification

The Adjudicator Workflow Monitor is a simple, single-page web application that provides a live feed of the consensus and verification tasks being performed. It visualizes the entire work-verify-correct loop between a worker AI (like Claude) and the supervisor AI (the Gemini Adjudicator).

### Features

-   **Real-Time Updates**: Uses WebSockets to display verification results the instant they happen, with no need to refresh the page.
-   **Grouped Task History**: Automatically groups all attempts for the same task together, showing the full history of the correction loop.
-   **At-a-Glance Status**: Clear, color-coded statuses (`PASS`, `FAIL`, `SKIPPED`) for immediate understanding.
-   **Collapsible Details**: A clean, one-line summary for each attempt keeps the interface uncluttered. You can click any attempt to see the detailed feedback and analysis that was sent back to the worker AI.

## How It Works: The Event Flow

The monitor is a simple yet powerful system composed of three parts:

1.  **The Hook**: The `run_verification.sh` script (triggered by a `PostToolUse` hook in Claude) is the source of truth. After the Adjudicator runs a verification, this script packages the result (task ID, attempt number, status, and feedback) into a JSON payload.

2.  **The Server**: A lightweight Node.js server (`server.mjs`) provides a single API endpoint at `/log`. The hook sends its JSON payload to this endpoint using a `curl` command.

3.  **The Frontend**: When the server receives data at the `/log` endpoint, it immediately broadcasts that data to all connected web clients using Socket.IO. The JavaScript on the HTML page (`public/app.js`) catches this event and dynamically renders the new log entry on the page.

This architecture ensures that the monitoring is decoupled from the main workflow—it simply listens for events and displays them as they come in.

## Tech Stack

-   **Backend**: [Node.js](https://nodejs.org/) with [Express](https://expressjs.com/) for the web server and [Socket.IO](https://socket.io/) for real-time WebSocket communication.
-   **Frontend**: Vanilla HTML5, CSS3, and JavaScript. No frameworks were used, to keep it simple and lightweight.
-   **Data Flow**: The hook scripts use `curl` to send JSON payloads to the server.

## Running the Global Monitor

This monitor is designed to be a standalone, global tool that you run once in the background. It will then be available to display verification results from any of your supervised projects.

### Recommended Setup

1.  **Move to a Central Location**: For a true global tool, move this `monitoring` directory out of the project folder and into a central location, for example, your home directory or a `.config` folder.
    ```bash
    # Example: Move to your home directory
    mv monitoring ~/gemini-adjudicator-monitor
    ```

2.  **Install Dependencies** (if you haven't already):
    ```bash
    # Navigate to the new directory
    cd ~/gemini-adjudicator-monitor
    npm install express socket.io
    ```

3.  **Start as a Background Service**:
    ```bash
    # Start the server and send it to the background
    node server.mjs &
    ```
    The server is now running persistently. You do not need to start it again unless you restart your computer.

4.  **Open the Monitor**:
    Navigate to **[http://localhost:4000](http://localhost:4000)** in your web browser. Bookmark it!

### Hook Configuration Note

The `run_verification.sh` hook script is pre-configured to send results to `http://localhost:4000/log`. As long as you run the monitor on the default port, no changes are needed in the hook scripts.
