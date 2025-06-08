// In-memory queue for print jobs (for local testing)
// In a production environment, you'd use a database or a persistent message queue.
let printQueue = [];

// Controller to get the next print job
const getPrintJob = (req, res) => {
    if (printQueue.length > 0) {
        const job = printQueue.shift(); // Get the oldest job and remove it from the queue
        res.set('Content-Type', 'text/xml;charset=utf-8'); // Set content type for ePOS-Print XML
        // For now, we send the job as is. Once we have the ePOS XML spec, this 'job' will be XML.
        res.status(200).send(job); 
        console.log('Sent job to printer:', job);
    } else {
        // No job available. The printer expects a specific response for "no job".
        // This needs to be an ePOS-Print XML compliant "no job" message or an empty 200 OK
        // For now, sending an empty 200 OK. This might need adjustment based on Epson's spec.
        console.log('No print job available for printer.');
        res.status(200).send(''); // Or specific "no job" XML
    }
};

// Controller to add a test print job (for local testing)
// In a real scenario, jobs would be added by your order/reservation logic.
const addTestPrintJob = (req, res) => {
    // Try this simpler XML format first
    const testXML = `<?xml version="1.0" encoding="utf-8"?>
<epos-print xmlns="http://www.epson.com/ESC/POS">
<text>TEST PRINT&#10;</text>
<text>Hello World!&#10;</text>
<text>Time: ${new Date().toLocaleString()}&#10;</text>
<feed line="3"/>
<cut/>
</epos-print>`;

    printQueue.push(testXML);
    console.log('Added test job to queue');
    res.status(201).send({ 
        message: 'Test job added to queue', 
        currentQueueSize: printQueue.length 
    });
};


module.exports = {
    getPrintJob,
    addTestPrintJob,
    // We can export the queue if needed for other modules, e.g., historyController
    // getPrintQueue: () => printQueue // Example
};
