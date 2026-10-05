(() => {
    const form = document.getElementById('ic-import-form');
    const fileInput = form.elements.file;
    const worksheet = form.elements.worksheet;
    const worksheetField = document.getElementById('worksheet-field');
    const status = document.getElementById('import-status');
    const submit = form.querySelector('button[type="submit"]');
    let requestVersion = 0;

    async function updateFile() {
        const version = ++requestVersion;
        const file = fileInput.files[0];
        const isExcel = !!file && /\.xlsx$/i.test(file.name);
        worksheetField.hidden = !isExcel;
        worksheet.required = isExcel;
        worksheet.disabled = true;
        worksheet.replaceChildren(new Option('請選擇要匯入的工作表', ''));
        status.textContent = '';
        submit.disabled = isExcel;
        if (!isExcel) return;
        status.textContent = '正在讀取工作表…';
        const data = new FormData();
        data.append('file', file);
        data.append('action', 'worksheets');
        data.append('csrfmiddlewaretoken', form.elements.csrfmiddlewaretoken.value);
        try {
            const response = await fetch(form.action, {method: 'POST', body: data});
            if (!response.headers.get('content-type')?.includes('application/json')) {
                throw new Error('無法讀取工作表，請確認登入狀態後重新選擇檔案。');
            }
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            if (!result.worksheets.length) throw new Error('檔案內沒有可匯入的工作表。');
            if (version !== requestVersion) return;
            for (const name of result.worksheets) worksheet.add(new Option(name, name));
            worksheet.disabled = false;
            status.textContent = '請選擇要匯入的工作表。';
        } catch (error) {
            if (version === requestVersion) status.textContent = error.message || '讀取失敗，請重新選擇檔案。';
        }
    }

    fileInput.addEventListener('change', updateFile);
    worksheet.addEventListener('change', () => { submit.disabled = !worksheet.value; });
    form.addEventListener('submit', event => {
        if (submit.disabled) event.preventDefault();
    });
    updateFile();
})();
