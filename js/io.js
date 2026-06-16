const IOManager = (() => {

    function triggerDownload(content, filename, mime) {
        const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function exportHtml(blocks) {
        const html = TemplateEngine.renderFullHtml(blocks);
        const filename = 'email-template-' + Date.now() + '.html';
        triggerDownload(html, filename, 'text/html;charset=utf-8');
    }

    function exportJson(state) {
        const data = {
            version: '1.0',
            createdAt: new Date().toISOString(),
            blocks: state.blocks
        };
        const json = JSON.stringify(data, null, 2);
        const filename = 'email-template-' + Date.now() + '.json';
        triggerDownload(json, filename, 'application/json');
    }

    function importJson(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('没有选择文件'));
                return;
            }
            if (!file.name.endsWith('.json')) {
                reject(new Error('请选择JSON文件'));
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data.blocks || !Array.isArray(data.blocks)) {
                        reject(new Error('JSON格式不正确：缺少blocks数组'));
                        return;
                    }
                    resolve(data);
                } catch (err) {
                    reject(new Error('JSON解析失败：' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('读取文件失败'));
            reader.readAsText(file, 'utf-8');
        });
    }

    return {
        exportHtml,
        exportJson,
        importJson
    };
})();
