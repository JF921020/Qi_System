(() => {
    const table = document.getElementById('ic-table');
    const form = document.getElementById('ic-search');
    const query = document.getElementById('ic-query');
    const empty = document.getElementById('ic-empty');
    const count = document.getElementById('ic-count');
    const rows = Array.from(table.querySelectorAll('[data-ic-row]'));
    const sort = document.getElementById('ic-sort');
    const nameHeading = document.getElementById('ic-name-heading');
    const searchText = new Map(rows.map(row => [row,
        Array.from(row.cells).slice(0, 3).map(cell => cell.dataset.sort).join(' ').toLocaleLowerCase('zh-TW'),
    ]));
    const collator = new Intl.Collator('zh-TW', {numeric: true, sensitivity: 'base'});

    function filter() {
        const term = query.value.trim().toLocaleLowerCase('zh-TW');
        let visible = 0;
        rows.forEach(row => {
            row.hidden = !searchText.get(row).includes(term);
            if (!row.hidden) visible++;
        });
        empty.hidden = visible > 0;
        empty.cells[0].textContent = rows.length
            ? '沒有符合搜尋的設定。' : '尚無 IC 設定，請匯入效率資料。';
        count.textContent = `顯示 ${visible} / ${rows.length} 筆設定`;
    }

    query.addEventListener('input', filter);
    form.addEventListener('submit', event => { event.preventDefault(); filter(); });
    form.addEventListener('reset', event => {
        event.preventDefault();
        query.value = '';
        filter();
        query.focus();
    });
    function sortRows() {
        const byTime = sort.value.startsWith('updated-');
        const ascending = sort.value.endsWith('-asc');
        nameHeading.setAttribute('aria-sort', byTime ? 'none' : ascending ? 'ascending' : 'descending');
        rows.sort((a, b) => {
            const nameOrder = collator.compare(a.dataset.name, b.dataset.name);
            if (!byTime) return nameOrder * (ascending ? 1 : -1);
            const left = a.dataset.updated;
            const right = b.dataset.updated;
            // Unknown historical dates stay last in either direction.
            if (!left || !right) return Number(!left) - Number(!right) || nameOrder;
            return (Number(left) - Number(right)) * (ascending ? 1 : -1) || nameOrder;
        });
        rows.forEach(row => table.tBodies[0].insertBefore(row, empty));
    }
    sort.addEventListener('change', sortRows);
    sortRows();
    filter();
})();
