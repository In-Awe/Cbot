const convertToCSV = (data: any[]): string => {
    if (!data || data.length === 0) {
        return '';
    }
    // Deep copy and sort by timestamp descending for user-friendly export
    const sortedData = [...data].sort((a, b) => {
        if (a.timestamp && b.timestamp) {
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        }
        return 0;
    });

    const headers = Object.keys(sortedData[0]);
    const csvRows = [headers.join(',')];

    for (const row of sortedData) {
        const values = headers.map(header => {
            let cell = row[header];
            if (cell === null || cell === undefined) {
                cell = '';
            } else if (cell instanceof Date) {
                cell = cell.toISOString();
            } else if (typeof cell === 'object') {
                cell = JSON.stringify(cell);
            } else {
                cell = String(cell);
            }
            // Escape quotes and wrap in quotes if it contains commas, quotes, or newlines
            if (/[",\n]/.test(cell)) {
                cell = `"${cell.replace(/"/g, '""')}"`;
            }
            return cell;
        });
        csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
};

export const exportToCsv = (filename: string, data: any[]): void => {
    if (!data || data.length === 0) {
        console.warn('No data available to export for:', filename);
        alert('No data available to export.');
        return;
    }
    try {
        const csvString = convertToCSV(data);
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error("Error during CSV export:", error);
        alert("An error occurred while trying to export the data.");
    }
};
