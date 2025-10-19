export function initUpload({ uploadBtn, fileInput, setCode, consoleOutput }) {

    // handle file upload
    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            setCode(text);

            // track upload analytics
            window.file_uploaded && window.file_uploaded({ 
                file_uploaded_name: file.name,
                file_uploaded_size: text.length,
                file_uploaded_type: file.type
            });

        } catch (err) {
            consoleOutput.lnerrln(`Failed to upload file "${file.name}": ${err.message}`);
            consoleOutput.writePrompt();
        }

        // reset file input so same file can be selected again
        event.target.value = '';
    };

    // wire button and file input
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', handleFileUpload);

    return { handleFileUpload };
}
