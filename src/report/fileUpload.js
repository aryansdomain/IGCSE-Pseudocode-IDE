export function initFileUpload(options = {}) {
    const files            = options.files;
    const previewContainer = options.previewContainer;
    const attachBtn        = options.attachBtn;
    const textareaWrap     = options.textareaWrap;
    const showError        = options.showError || alert;
    const workerUrl        = options.workerUrl || "";
    let selectedFiles = [];

    // ------------------------ Constants ------------------------
    const MAX_FILE_COUNT = 3;
    const MAX_FILE_SIZE  = 2 * 1024 * 1024; // 2 MB

    // ------------------------ Utilities ------------------------
    
    function formatFileSize(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // validate file extension
    function isValidFile(file) {
        const fileName = file.name || "";

        const ALLOWED_EXTENSIONS = [
            '.jpg', '.jpeg', '.png', '.gif', '.webp',
            '.pdf',
            '.txt', '.md',
            '.json',
        ];
        
        // check if file extension is allowed
        const extension = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase() : '';
        if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
            return { valid: false, error: 'File type not allowed.' };
        }
        
        return { valid: true };
    }
    
    function addFilePreview(file) {

        // create a preview of the file
        const preview = document.createElement('div');
        preview.className = 'file-preview';
        preview.dataset.fileName = file.name;
        
        // create file info
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        fileInfo.innerHTML = `
            <div class="file-name">${file.name}</div>
            <div class="file-size">${formatFileSize(file.size)}</div>
        `;
        
        // create remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '<i class="fas fa-xmark"></i>';
        removeBtn.onclick = () => {
            selectedFiles = selectedFiles.filter(f => f !== file);
            files.files = createFileList(selectedFiles);
            updatePreviews();
        }
        
        preview.appendChild(fileInfo);
        preview.appendChild(removeBtn);
        previewContainer.appendChild(preview);
        
        // show image on the screen
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.alt = file.name;
                img.className = 'file-image';
                
                preview.insertBefore(img, fileInfo);
                fileInfo.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    }

    function createFileList(files) {
        const dt = new DataTransfer();
        files.forEach(file => dt.items.add(file));
        return dt.files;
    }

    function updatePreviews() {
        previewContainer.innerHTML = '';
        selectedFiles.forEach(file => addFilePreview(file));
    }

    function handleFiles(fileList) {
        const newFiles = Array.from(fileList);
        
        // check if file count limit exceeded
        if (selectedFiles.length + newFiles.length > MAX_FILE_COUNT) {
            const remainingSlots = MAX_FILE_COUNT - selectedFiles.length;
            if (remainingSlots <= 0) return;
            showError(`Maximum file count of ${MAX_FILE_COUNT} exceeded.`);
            newFiles.splice(remainingSlots);
        }
        
        // check if file size limit exceeded
        let totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
        const validFiles = [];
        
        for (const file of newFiles) {
            
            // validate file extension
            const validation = isValidFile(file);
            if (!validation.valid) {
                showError(validation.error);
                continue;
            }

            // check file size
            const newTotalSize = totalSize + file.size;
            if (newTotalSize > MAX_FILE_SIZE) {
                showError('Maximum file size of 2 MB exceeded.');
                break;
            }
            
            validFiles.push(file);
            totalSize = newTotalSize;
        }
        
        selectedFiles = [...selectedFiles, ...validFiles];
        files.files = createFileList(selectedFiles);
        updatePreviews();
    }

    function showFileWarning() {
        return new Promise((resolve) => {
            
            // create popup overlay
            const overlay = document.createElement('div');
            overlay.className = 'warning-overlay';

            // clone popup template
            const template = document.getElementById('warning-popup-template');
            const popup = template.content.cloneNode(true).firstElementChild;

            overlay.appendChild(popup);
            document.body.appendChild(overlay);

            // event handlers
            const goBackBtn = popup.querySelector('#goBackBtn');
            const continueBtn = popup.querySelector('#continueBtn');
            const closeBtn = popup.querySelector('#closePopup');

            goBackBtn.onclick = () => {
                document.body.removeChild(overlay);
                resolve(false);
            };

            continueBtn.onclick = () => {
                document.body.removeChild(overlay);
                resolve(true);
            };

            closeBtn.onclick = () => {
                document.body.removeChild(overlay);
                resolve(false);
            };

            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    document.body.removeChild(overlay);
                    resolve(false);
                }
            };
        });
    }

    // ------------------------ Init ------------------------

    // file input change
    files.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    // attach button click
    attachBtn.addEventListener('click', () => {
        if (files) files.click();
    });

    // drag and drop
    let dragCounter = 0;

    const setDragState = (active) => {
        if (!textareaWrap) return;
        if (active) textareaWrap.classList.add('dragover');
        else        textareaWrap.classList.remove('dragover');
    };

    textareaWrap.addEventListener('dragenter', e => {
        e.preventDefault();
        dragCounter++;
        setDragState(true);
    });
    textareaWrap.addEventListener('dragleave', e => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
            setDragState(false);
        }
    });
    textareaWrap.addEventListener('dragover', e => {
        e.preventDefault();
    });
    textareaWrap.addEventListener('dragend', e => {
        e.preventDefault();
        dragCounter = 0;
        setDragState(false);
    });
    textareaWrap.addEventListener('drop', e => {
        e.preventDefault();
        dragCounter = 0;
        setDragState(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) handleFiles(files);
    });

    // paste
    document.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        // add all files
        const files = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) files.push(file);
            }
        }

        if (files.length > 0) {
            e.preventDefault();
            handleFiles(files);
        }
    });

    // upload attached files to Cloudflare server and return urls
    async function uploadSelected() {
        if (!selectedFiles || selectedFiles.length === 0) return [];

        // append files to FormData
        const fd = new FormData();
        for (const f of selectedFiles) fd.append("file", f);

        // send POST request, upload files to Cloudflare
        const result = await fetch(workerUrl + "/upload", { method: "POST", body: fd });
        
        // get urls from JSON
        const text = await result.text();
        let json = text ? JSON.parse(text) : {};
        if (!result.ok) throw new Error(json.error || `upload failed: ${result.status}`);
        
        const urls = json.urls;
        if (urls.length !== selectedFiles.length) throw new Error("upload failed: mismatch");

        // return urls with name and type
        return urls.map((url, idx) => ({
            url,
            name: selectedFiles[idx]?.name || `attachment-${idx + 1}`,
            type: selectedFiles[idx]?.type || "",
        }));
    }

    return {
        getSelectedFiles: () => selectedFiles,
        clearFiles: () => {
            selectedFiles = [];
            files.files = createFileList([]);
            updatePreviews();
        },
        uploadSelected,
        showFileWarning
    };
}
