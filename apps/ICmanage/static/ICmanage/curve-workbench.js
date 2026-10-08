(() => {
    function initialize(section) {
        const editable = section.dataset.editable === 'true';
        const form = editable ? section.closest('form') : null;
        const field = editable ? form.elements.namedItem('points') : null;
        const find = selector => section.querySelector(selector);
        let points;
        try {
            points = JSON.parse(editable ? field.value || '[]' : find('script').textContent);
            if (!Array.isArray(points) || !points.every(point => Array.isArray(point) && point.length === 2 &&
                point.every(value => value === null || typeof value === 'number'))) return;
        } catch { return; } // Invalid JSON remains available in the original field for repair.
        const query = find('[data-query]');
        const sort = find('[data-sort]');
        const size = find('[data-size]');
        const body = find('tbody');
        const chart = find('svg');
        let page = 0;
        const axisLabel = () => editable ? form.elements.namedItem('axis').selectedOptions[0].textContent : section.dataset.axis;
        const selected = () => points.map((point, index) => ({point, index})).filter(({point}) =>
            point.some(value => String(value ?? '').includes(query.value.trim())));
        function svg(tag, attrs, text) {
            const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
            Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
            if (text !== undefined) node.textContent = text;
            chart.appendChild(node);
            return node;
        }
        function draw() {
            const model = editable ? form.elements.namedItem('model_number').value : section.dataset.model;
            const voltage = editable ? form.elements.namedItem('voltage').value : section.dataset.voltage;
            const title = `${model} · ${voltage === '' ? '電壓未提供' : voltage + ' V'}`;
            find('[data-title]').textContent = title;
            chart.setAttribute('aria-label', `${title}；${axisLabel()} 對效率 (%) 趨勢圖`);
            chart.replaceChildren();
            const data = selected().map(({point}) => point).sort((a, b) => a[0] - b[0]);
            const valid = data.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1000000 && y >= 0 && y <= 100);
            const hideChart = !data.length || !valid;
            chart.toggleAttribute('hidden', hideChart);
            find('[data-chart-note]').textContent = !valid ? '含空白或無效數值，請修正資料點後再顯示趨勢圖。' :
                !data.length ? '沒有可繪製的資料點。' : `趨勢圖顯示搜尋結果全部 ${data.length} 點，不受分頁影響；依 X 遞增連線。`;
            if (hideChart) return;
            const low = data[0][0], high = data[data.length - 1][0];
            const x = value => high === low ? 340 : 60 + (value - low) / (high - low) * 540;
            const y = value => 230 - value * 2;
            [0, 25, 50, 75, 100].forEach(value => {
                svg('line', {x1: 60, y1: y(value), x2: 600, y2: y(value), stroke: '#e2e8f0'});
                svg('text', {x: 50, y: y(value) + 4, 'text-anchor': 'end', 'font-size': 12}, String(value));
            });
            svg('text', {x: 60, y: 18, 'font-size': 12}, '效率 (%)');
            svg('text', {x: 60, y: 249, 'font-size': 12}, String(low));
            svg('text', {x: 600, y: 249, 'text-anchor': 'end', 'font-size': 12}, String(high));
            svg('text', {x: 330, y: 272, 'text-anchor': 'middle', 'font-size': 12}, axisLabel());
            svg('polyline', {points: data.map(point => `${x(point[0])},${y(point[1])}`).join(' '), fill: 'none', stroke: '#4f46e5', 'stroke-width': 2});
            // Dense curves retain every line vertex; individual values remain in the paged table.
            if (data.length <= 300) data.forEach(point => {
                const dot = svg('circle', {cx: x(point[0]), cy: y(point[1]), r: 3, fill: '#4f46e5'});
                const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                tooltip.textContent = `${axisLabel()}: ${point[0]}；效率: ${point[1]}%`;
                dot.appendChild(tooltip);
            });
        }
        function render() {
            const [column, direction] = sort.value.split('-');
            const matches = selected();
            matches.sort((a, b) => {
                if (a.point[column] === null || b.point[column] === null) return Number(b.point[column] === null) - Number(a.point[column] === null);
                return (a.point[column] - b.point[column]) * (direction === 'asc' ? 1 : -1);
            });
            const pages = Math.max(1, Math.ceil(matches.length / Number(size.value)));
            page = Math.min(page, pages - 1);
            body.replaceChildren();
            matches.slice(page * Number(size.value), (page + 1) * Number(size.value)).forEach(({point, index}) => {
                const row = body.insertRow();
                row.insertCell().textContent = index + 1;
                point.forEach((value, columnIndex) => {
                    const cell = row.insertCell();
                    if (!editable) { cell.textContent = value; return; }
                    const input = document.createElement('input');
                    input.type = 'number'; input.step = 'any'; input.value = value ?? '';
                    input.setAttribute('aria-label', `第 ${index + 1} 點 ${columnIndex ? '效率 (%)' : axisLabel()}`);
                    input.addEventListener('input', () => {
                        point[columnIndex] = input.value === '' || !Number.isFinite(input.valueAsNumber) ? null : input.valueAsNumber;
                        draw();
                    });
                    cell.appendChild(input);
                });
                if (editable) {
                    const remove = document.createElement('button');
                    remove.type = 'button'; remove.textContent = '刪除';
                    remove.setAttribute('aria-label', `刪除第 ${index + 1} 點`);
                    remove.addEventListener('click', () => { points.splice(index, 1); render(); });
                    row.insertCell().appendChild(remove);
                }
            });
            find('[data-axis-heading]').textContent = axisLabel();
            Array.from(find('thead tr').cells).forEach((heading, index) => {
                heading.setAttribute('aria-sort', index === Number(column) + 1 ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
            });
            find('[data-status]').textContent = matches.length ? `第 ${page + 1} / ${pages} 頁 · ${matches.length} / ${points.length} 筆` : '沒有符合的資料點。';
            find('[data-prev]').disabled = page === 0;
            find('[data-next]').disabled = page >= pages - 1;
            draw();
        }
        query.addEventListener('input', () => { page = 0; render(); });
        [sort, size].forEach(control => control.addEventListener('change', () => { page = 0; render(); }));
        find('[data-prev]').addEventListener('click', () => { page--; render(); });
        find('[data-next]').addEventListener('click', () => { page++; render(); });
        if (editable) {
            find('[data-add]').addEventListener('click', () => {
                points.unshift([null, null]); page = 0; query.value = ''; sort.value = '0-asc'; render();
                body.querySelector('input')?.focus();
            });
            form.elements.namedItem('axis').addEventListener('change', render);
            ['model_number', 'voltage'].forEach(name => form.elements.namedItem(name).addEventListener('input', draw));
            const mode = form.elements.namedItem('mode');
            mode.addEventListener('change', () => { render(); section.hidden = mode.value !== 'curve'; });
            section.hidden = mode.value !== 'curve';
            form.addEventListener('submit', () => {
                field.value = JSON.stringify(mode.value === 'fixed' ? [] : [...points].sort((a, b) => a[0] - b[0]));
            });
            form.querySelector('[data-points-json]').hidden = true;
        }
        section.querySelectorAll('.curve-controls').forEach(control => { control.hidden = false; });
        render();
    }
    document.querySelectorAll('.curve-workbench').forEach(section => {
        const details = section.closest('details');
        if (!details || details.open) { initialize(section); return; }
        const open = () => {
            if (details.open) { initialize(section); details.removeEventListener('toggle', open); }
        };
        details.addEventListener('toggle', open);
    });
})();
