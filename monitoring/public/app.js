document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const logContainer = document.getElementById('log-container');
    const statusIndicator = document.getElementById('status-indicator');

    socket.on('connect', () => {
        statusIndicator.textContent = 'Connected';
        statusIndicator.className = 'status-indicator status-connected';
    });

    socket.on('disconnect', () => {
        statusIndicator.textContent = 'Disconnected';
        statusIndicator.className = 'status-indicator status-disconnected';
    });

    socket.on('log', (data) => {
        renderLogEntry(data);
    });

    function renderLogEntry(data) {
        const { taskId, attempt, status, feedback, worker, adjudicator } = data;

        // Use a consistent task ID for grouping attempts
        const entryId = `task-${taskId.replace(/[^a-zA-Z0-9]/g, '-')}`;
        let taskGroup = document.getElementById(entryId);

        if (!taskGroup) {
            taskGroup = document.createElement('div');
            taskGroup.id = entryId;
            taskGroup.className = 'log-entry';
            logContainer.prepend(taskGroup);
        }

        // Create the summary line for the latest attempt
        const summary = document.createElement('div');
        summary.className = 'summary';
        summary.innerHTML = `
            <div class="task-info">
                <strong>Task:</strong> <span class="task-id">${taskId}</span> (Attempt #${attempt})
            </div>
            <div class="status status-${status}">${status}</div>
        `;

        // Create the details section for this attempt
        const details = document.createElement('div');
        details.className = 'details';
        details.innerHTML = `
            <strong>Worker:</strong> ${worker}<br>
            <strong>Adjudicator:</strong> ${adjudicator}<br>
            <strong>Feedback:</strong>
            <pre>${feedback || 'N/A'}</pre>
        `;

        // Add click listener to toggle details
        summary.addEventListener('click', () => {
            details.classList.toggle('visible');
        });

        // Add the new attempt to the top of the group
        taskGroup.prepend(details);
        taskGroup.prepend(summary);
    }
});
