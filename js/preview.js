const PreviewRenderer = (() => {

    let iframeEl = null;
    let containerEl = null;
    let currentView = 'desktop';

    function init(iframeSelector, containerSelector) {
        iframeEl = document.querySelector(iframeSelector);
        containerEl = document.querySelector(containerSelector);
    }

    function render(blocks) {
        if (!iframeEl) return;
        const html = TemplateEngine.renderFullHtml(blocks);
        const doc = iframeEl.contentDocument || iframeEl.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
    }

    function setView(view) {
        currentView = view;
        if (containerEl) {
            containerEl.classList.remove('view-desktop', 'view-mobile');
            containerEl.classList.add('view-' + view);
        }
    }

    function getView() {
        return currentView;
    }

    return {
        init,
        render,
        setView,
        getView
    };
})();
