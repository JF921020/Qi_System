document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('input', () => {
            if (input.valueAsNumber < 0) input.value = '0';
        });
    });
    initEventListeners();
    syncUIInputs();
    triggerCalc();
    switchDisplayTab('calc'); // 確保初始載入時，底部資訊列等分頁相依的顯示狀態正確套用（預設為效能計算分頁）
});
