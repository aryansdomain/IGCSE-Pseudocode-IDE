export function initUpload({ uploadBtn, fileInput, setCode, consoleOutput }) {

    // handle file upload
    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const text = await file.text();
        setCode(text);

        // track upload analytics
        try {
            window.code_uploaded && window.code_uploaded({
                code_uploaded_size: text.length
            });
        } catch {}

        // reset file input so same file can be selected again
        event.target.value = '';
    };

    // wire button and file input
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', handleFileUpload);
}
