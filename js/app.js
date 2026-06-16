const App = (() => {

    let draggingType = null;
    let draggingBlockId = null;
    let draggingParentBlockId = null;
    let draggingColId = null;
    let dragOverTarget = null;

    let currentSearchKeyword = '';
    let currentCategory = '全部';
    let contextMenuTemplateId = null;
    let thumbnailGenerating = {};

    const STORAGE_KEY = 'email_template_editor_state_v1';

    function saveStateToStorage(state) {
        try {
            const data = {
                blocks: state.blocks,
                savedAt: Date.now()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('保存到 localStorage 失败:', e);
        }
    }

    function loadStateFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || !Array.isArray(data.blocks)) return null;
            return {
                blocks: data.blocks,
                selectedId: null,
                selectedColId: null
            };
        } catch (e) {
            console.warn('从 localStorage 读取失败:', e);
            return null;
        }
    }

    function clearStateFromStorage() {
        localStorage.removeItem(STORAGE_KEY);
    }

    function init() {
        let initialState = loadStateFromStorage();
        if (!initialState) {
            initialState = {
                blocks: [],
                selectedId: null,
                selectedColId: null
            };
        }

        LayoutManager.init(initialState, {
            onChange: onStateChange,
            onSelect: onSelectChange
        });

        PreviewRenderer.init('#preview-iframe', '#preview-container');
        TemplateLibrary.init();

        renderComponentList();
        bindGlobalEvents();
        bindTemplateLibraryEvents();
        bindModalEvents();
        bindContextMenuEvents();
        renderEditor();
        PreviewRenderer.render(initialState.blocks);
        renderTemplateGrid();
        generateMissingThumbnails();
    }

    function onStateChange(state) {
        saveStateToStorage(state);
        renderEditor();
        PreviewRenderer.render(state.blocks);
        renderProperties();
    }

    function onSelectChange(blockId, colId) {
        renderEditor();
        renderProperties();
    }

    function renderComponentList() {
        const list = document.getElementById('component-list');
        const components = ComponentLibrary.getAllComponents();

        list.innerHTML = components.map(function(comp) {
            return '<div class="component-item" draggable="true" data-type="' + comp.type + '">' +
                '<span class="icon">' + comp.icon + '</span>' +
                '<span class="label">' + comp.label + '</span>' +
            '</div>';
        }).join('');

        list.querySelectorAll('.component-item').forEach(function(item) {
            item.addEventListener('dragstart', function(e) {
                draggingType = item.dataset.type;
                draggingBlockId = null;
                draggingParentBlockId = null;
                draggingColId = null;
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', draggingType);
            });

            item.addEventListener('dragend', function() {
                clearDragState();
            });
        });
    }

    function bindGlobalEvents() {
        document.getElementById('btn-view-desktop').addEventListener('click', function() {
            setViewToggle('desktop');
        });
        document.getElementById('btn-view-mobile').addEventListener('click', function() {
            setViewToggle('mobile');
        });

        document.getElementById('btn-export-html').addEventListener('click', function() {
            IOManager.exportHtml(LayoutManager.getState().blocks);
        });

        document.getElementById('btn-export-json').addEventListener('click', function() {
            IOManager.exportJson(LayoutManager.getState());
        });

        const fileInput = document.getElementById('file-import');
        document.getElementById('btn-import-json').addEventListener('click', function() {
            fileInput.click();
        });
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            IOManager.importJson(file).then(function(data) {
                LayoutManager.setState({ blocks: data.blocks, selectedId: null, selectedColId: null });
            }).catch(function(err) {
                alert(err.message);
            });
            fileInput.value = '';
        });

        document.getElementById('btn-clear').addEventListener('click', function() {
            if (LayoutManager.getState().blocks.length === 0) return;
            if (confirm('确定要清空所有内容吗？（本地缓存也会一并清除）')) {
                LayoutManager.clearAll();
                clearStateFromStorage();
            }
        });

        document.getElementById('btn-reset-storage').addEventListener('click', function() {
            if (confirm('确定要重置本地缓存吗？\n\n这将清空所有已保存的编辑内容，恢复到空白状态。')) {
                clearStateFromStorage();
                LayoutManager.clearAll();
                alert('本地缓存已重置！');
            }
        });

        const canvas = document.getElementById('editor-canvas');

        canvas.addEventListener('dragover', function(e) {
            if (!draggingType && !draggingBlockId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = draggingBlockId ? 'move' : 'copy';
            canvas.classList.add('drag-over');
        });

        canvas.addEventListener('dragleave', function(e) {
            if (e.target === canvas) {
                canvas.classList.remove('drag-over');
            }
        });

        canvas.addEventListener('drop', function(e) {
            e.preventDefault();
            canvas.classList.remove('drag-over');
            clearDragOver();

            if (draggingType && !draggingBlockId) {
                const block = ComponentLibrary.createBlock(draggingType);
                LayoutManager.addBlock(block);
            }
            clearDragState();
        });

        document.addEventListener('click', function(e) {
            const blockWrapper = e.target.closest('.block-wrapper');
            const childWrapper = e.target.closest('.child-block-wrapper');
            const column = e.target.closest('.mj-column');
            const actionBtn = e.target.closest('.block-action-btn');
            const properties = e.target.closest('.properties-panel');
            const componentItem = e.target.closest('.component-item');
            const contextMenu = document.getElementById('template-context-menu');

            if (!contextMenu.classList.contains('hidden')) {
                contextMenu.classList.add('hidden');
            }

            if (!blockWrapper && !childWrapper && !column && !properties && !componentItem) {
                LayoutManager.selectBlock(null, null);
            }
        });
    }

    function bindTemplateLibraryEvents() {
        document.querySelectorAll('.sidebar-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                const targetTab = tab.dataset.tab;
                switchSidebarTab(targetTab);
            });
        });

        document.getElementById('btn-save-as-template').addEventListener('click', function() {
            const blocks = LayoutManager.getState().blocks;
            if (blocks.length === 0) {
                alert('画布为空，请先添加一些内容再保存为模板。');
                return;
            }
            showSaveTemplateModal();
        });

        const searchInput = document.getElementById('template-search');
        let searchTimeout = null;
        searchInput.addEventListener('input', function(e) {
            if (searchTimeout) clearTimeout(searchTimeout);
            searchTimeout = setTimeout(function() {
                currentSearchKeyword = e.target.value;
                renderTemplateGrid();
            }, 200);
        });

        document.querySelectorAll('.category-filter-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.category-filter-btn').forEach(function(b) {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                currentCategory = btn.dataset.category;
                renderTemplateGrid();
            });
        });
    }

    function switchSidebarTab(tabName) {
        document.querySelectorAll('.sidebar-tab').forEach(function(tab) {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        document.querySelectorAll('.sidebar-tab-content').forEach(function(content) {
            content.classList.toggle('active', content.dataset.tabContent === tabName);
        });
    }

    function renderTemplateGrid() {
        const grid = document.getElementById('template-grid');
        const templates = TemplateLibrary.searchTemplates({
            keyword: currentSearchKeyword,
            category: currentCategory
        });

        if (templates.length === 0) {
            grid.innerHTML = '<div class="template-empty">' +
                '<div class="template-empty-icon">📭</div>' +
                '<p>暂无模板</p>' +
                '<p style="font-size:11px;margin-top:4px;opacity:0.8;">尝试调整筛选条件或保存新模板</p>' +
            '</div>';
            return;
        }

        grid.innerHTML = templates.map(function(tpl) {
            const displayName = tpl.name.length > 10 ? tpl.name.substring(0, 10) + '...' : tpl.name;
            const cardClass = 'template-card' + (tpl.isPreset ? ' preset' : '');
            const tagsHtml = (tpl.tags && tpl.tags.length > 0)
                ? '<div class="template-tags">' + tpl.tags.slice(0, 3).map(function(tag) {
                    return '<span class="template-tag">' + escapeHtml(tag.substring(0, 6)) + '</span>';
                }).join('') + '</div>'
                : '';

            const thumbnailContent = tpl.thumbnail
                ? '<img src="' + tpl.thumbnail + '" alt="' + escapeHtml(tpl.name) + '" onerror="this.parentNode.innerHTML=\'<div class=\\\'thumbnail-placeholder\\\'><span>📧</span><span>加载失败</span></div>\'">'
                : '<div class="thumbnail-placeholder" data-tpl-id="' + tpl.id + '"><span>📧</span><span>' + (tpl.isPreset ? '预设' : '自定义') + '</span></div>';

            return '<div class="' + cardClass + '" data-template-id="' + tpl.id + '">' +
                '<div class="template-thumbnail">' + thumbnailContent + '</div>' +
                '<div class="template-info">' +
                    '<div class="template-name" title="' + escapeHtml(tpl.name) + '">' + escapeHtml(displayName) + '</div>' +
                    '<div class="template-meta">' +
                        '<span class="template-category-tag">' + escapeHtml(tpl.category) + '</span>' +
                        '<span class="template-use-count" title="使用次数">' +
                            '<span>👁️</span><span>' + (tpl.useCount || 0) + '</span>' +
                        '</span>' +
                    '</div>' +
                '</div>' +
                tagsHtml +
            '</div>';
        }).join('');

        grid.querySelectorAll('.template-card').forEach(function(card) {
            const tplId = card.dataset.templateId;

            card.addEventListener('click', function(e) {
                if (e.button === 2) return;
                showApplyTemplateConfirm(tplId);
            });

            card.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                e.stopPropagation();
                showContextMenu(tplId, e.clientX, e.clientY);
            });
        });
    }

    function generateMissingThumbnails() {
        const templates = TemplateLibrary.getAllTemplates();
        templates.forEach(function(tpl) {
            if (!tpl.thumbnail && !thumbnailGenerating[tpl.id]) {
                thumbnailGenerating[tpl.id] = true;
                const blocks = TemplateLibrary.getTemplateBlocks(tpl.id);
                if (blocks) {
                    TemplateLibrary.generateThumbnail(blocks).then(function(thumb) {
                        try {
                            TemplateLibrary.updateTemplate(tpl.id, { thumbnail: thumb });
                        } catch (e) {}
                        const placeholder = document.querySelector('.thumbnail-placeholder[data-tpl-id="' + tpl.id + '"]');
                        if (placeholder) {
                            placeholder.parentNode.innerHTML = '<img src="' + thumb + '" alt="' + escapeHtml(tpl.name) + '">';
                        }
                        delete thumbnailGenerating[tpl.id];
                    });
                } else {
                    delete thumbnailGenerating[tpl.id];
                }
            }
        });
    }

    function showApplyTemplateConfirm(tplId) {
        const tpl = TemplateLibrary.getTemplateById(tplId);
        if (!tpl) {
            alert('模板不存在或已损坏');
            renderTemplateGrid();
            return;
        }

        const currentBlocks = LayoutManager.getState().blocks;
        const hasContent = currentBlocks && currentBlocks.length > 0;

        if (!hasContent) {
            applyTemplate(tplId);
            return;
        }

        const dateStr = new Date(tpl.metadata.createdAt).toLocaleDateString('zh-CN');
        const blockCount = tpl.blocks.length;

        showModal({
            title: '应用模板',
            body: '<p>您即将应用模板 <strong style="color:#667eea;">' + escapeHtml(tpl.metadata.name) + '</strong>。</p>' +
                '<div class="template-preview-box">' +
                    '<h4>模板信息</h4>' +
                    '<div class="template-preview-meta">' +
                        '<span>📦 组件数：' + blockCount + '</span>' +
                        '<span>🏷️ 分类：' + escapeHtml(tpl.metadata.category) + '</span>' +
                        '<span>📅 创建：' + dateStr + '</span>' +
                    '</div>' +
                '</div>' +
                '<p style="color:#ef4444;margin-top:16px;">⚠️ 当前画布已有内容，应用模板将<strong>覆盖</strong>现有编辑内容，此操作不可撤销。</p>' +
                '<p>确定要继续吗？</p>',
            buttons: [
                {
                    text: '取消',
                    class: 'btn-secondary',
                    onClick: closeModal
                },
                {
                    text: '确认覆盖',
                    class: 'btn-primary',
                    style: 'background:#667eea;color:white;',
                    onClick: function() {
                        closeModal();
                        applyTemplate(tplId);
                    }
                }
            ]
        });
    }

    function applyTemplate(tplId) {
        const blocks = TemplateLibrary.getTemplateBlocks(tplId);
        if (!blocks) {
            alert('模板内容加载失败');
            return;
        }

        if (!TemplateLibrary.validateBlocks(blocks)) {
            alert('模板数据格式无效，可能已损坏');
            return;
        }

        const clonedBlocks = JSON.parse(JSON.stringify(blocks));
        regenerateBlockIds(clonedBlocks);

        LayoutManager.setState({
            blocks: clonedBlocks,
            selectedId: null,
            selectedColId: null
        });

        TemplateLibrary.incrementUseCount(tplId);

        switchSidebarTab('preview');
        renderTemplateGrid();
    }

    function regenerateBlockIds(blocks) {
        function newId(prefix) {
            return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }

        blocks.forEach(function(block) {
            block.id = newId('block');
            if (block.type === 'columns' && block.data && block.data.children) {
                block.data.children.forEach(function(col) {
                    col.id = newId('col');
                    if (col.blocks) {
                        regenerateBlockIds(col.blocks);
                    }
                });
            }
        });
    }

    function showSaveTemplateModal() {
        const blocks = LayoutManager.getState().blocks;

        showModal({
            title: '保存为模板',
            body: '<div class="modal-form-group">' +
                    '<label for="save-tpl-name">模板名称 *</label>' +
                    '<input type="text" id="save-tpl-name" placeholder="给模板起个名字" maxlength="50">' +
                '</div>' +
                '<div class="modal-form-group">' +
                    '<label for="save-tpl-category">分类</label>' +
                    '<select id="save-tpl-category">' +
                        '<option value="自定义">自定义</option>' +
                        '<option value="营销推广">营销推广</option>' +
                        '<option value="通知确认">通知确认</option>' +
                        '<option value="活动邀请">活动邀请</option>' +
                        '<option value="账户安全">账户安全</option>' +
                    '</select>' +
                '</div>' +
                '<div class="modal-form-group">' +
                    '<label>标签</label>' +
                    '<div class="tags-input-wrapper" id="save-tpl-tags">' +
                        '<input type="text" placeholder="输入标签后按回车添加" id="save-tpl-tag-input">' +
                    '</div>' +
                    '<div class="modal-form-hint">添加标签便于后续搜索，多个标签用回车分隔</div>' +
                '</div>' +
                '<div class="modal-form-group">' +
                    '<div class="template-preview-box">' +
                        '<h4>当前内容</h4>' +
                        '<div class="template-preview-meta">' +
                            '<span>📦 ' + blocks.length + ' 个组件</span>' +
                        '</div>' +
                    '</div>' +
                '</div>',
            buttons: [
                {
                    text: '取消',
                    class: 'btn-secondary',
                    onClick: closeModal
                },
                {
                    text: '保存模板',
                    class: 'btn-primary',
                    style: 'background:#667eea;color:white;',
                    onClick: function() {
                        handleSaveTemplate(blocks);
                    }
                }
            ],
            onMounted: initTagsInput
        });
    }

    function initTagsInput() {
        const tags = [];
        const wrapper = document.getElementById('save-tpl-tags');
        const input = document.getElementById('save-tpl-tag-input');

        wrapper._tags = tags;

        function renderTags() {
            const chips = wrapper.querySelectorAll('.tag-chip');
            chips.forEach(function(c) { c.remove(); });

            tags.forEach(function(tag, idx) {
                const chip = document.createElement('span');
                chip.className = 'tag-chip';
                chip.innerHTML = escapeHtml(tag) + ' <span class="tag-chip-remove" data-idx="' + idx + '">&times;</span>';
                wrapper.insertBefore(chip, input);
            });

            wrapper.querySelectorAll('.tag-chip-remove').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const i = parseInt(btn.dataset.idx);
                    tags.splice(i, 1);
                    renderTags();
                });
            });
        }

        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const val = input.value.trim();
                if (val && tags.indexOf(val) === -1 && tags.length < 10) {
                    tags.push(val.substring(0, 15));
                    input.value = '';
                    renderTags();
                } else if (tags.length >= 10) {
                    alert('最多只能添加10个标签');
                }
                input.value = '';
            } else if (e.key === 'Backspace' && input.value === '' && tags.length > 0) {
                tags.pop();
                renderTags();
            }
        });

        wrapper.addEventListener('click', function(e) {
            if (e.target === wrapper || e.target === input) {
                input.focus();
            }
        });
    }

    function handleSaveTemplate(blocks) {
        const nameInput = document.getElementById('save-tpl-name');
        const categorySelect = document.getElementById('save-tpl-category');
        const tagsWrapper = document.getElementById('save-tpl-tags');

        const name = nameInput.value.trim();
        const category = categorySelect.value;
        const tags = tagsWrapper._tags || [];

        if (!name) {
            nameInput.focus();
            nameInput.style.borderColor = '#ef4444';
            setTimeout(function() { nameInput.style.borderColor = ''; }, 2000);
            return;
        }

        closeModal();

        const statusEl = document.createElement('div');
        statusEl.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px 32px;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.2);z-index:30000;font-size:14px;color:#374151;display:flex;align-items:center;gap:10px;';
        statusEl.innerHTML = '<span style="font-size:20px;">⏳</span><span>正在生成缩略图...</span>';
        document.body.appendChild(statusEl);

        TemplateLibrary.generateThumbnail(blocks).then(function(thumbnail) {
            try {
                const result = TemplateLibrary.createTemplate({
                    name: name,
                    category: category,
                    tags: tags,
                    blocks: blocks,
                    thumbnail: thumbnail
                });

                statusEl.innerHTML = '<span style="font-size:20px;">✅</span><span>模板保存成功！</span>';
                renderTemplateGrid();

                setTimeout(function() {
                    if (statusEl.parentNode) statusEl.parentNode.removeChild(statusEl);
                }, 1500);
            } catch (e) {
                statusEl.innerHTML = '<span style="font-size:20px;">❌</span><span>' + escapeHtml(e.message || '保存失败') + '</span>';
                setTimeout(function() {
                    if (statusEl.parentNode) statusEl.parentNode.removeChild(statusEl);
                }, 2500);
            }
        });
    }

    function showContextMenu(tplId, x, y) {
        contextMenuTemplateId = tplId;
        const menu = document.getElementById('template-context-menu');
        const tpl = TemplateLibrary.getTemplateById(tplId);
        const isPreset = tpl && tpl.metadata && tpl.metadata.isPreset;

        menu.querySelectorAll('[data-only-custom="true"]').forEach(function(el) {
            el.classList.toggle('hidden', isPreset);
        });

        menu.classList.remove('hidden');

        const rect = menu.getBoundingClientRect();
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;

        let finalX = x;
        let finalY = y;

        if (x + rect.width > viewportW - 10) {
            finalX = viewportW - rect.width - 10;
        }
        if (y + rect.height > viewportH - 10) {
            finalY = viewportH - rect.height - 10;
        }

        menu.style.left = finalX + 'px';
        menu.style.top = finalY + 'px';
    }

    function bindContextMenuEvents() {
        const menu = document.getElementById('template-context-menu');

        menu.querySelectorAll('.context-menu-item').forEach(function(item) {
            item.addEventListener('click', function() {
                const action = item.dataset.action;
                const tplId = contextMenuTemplateId;
                menu.classList.add('hidden');

                if (!tplId) return;

                switch (action) {
                    case 'apply':
                        showApplyTemplateConfirm(tplId);
                        break;
                    case 'rename':
                        showRenameTemplateModal(tplId);
                        break;
                    case 'export':
                        exportTemplate(tplId);
                        break;
                    case 'delete':
                        showDeleteTemplateConfirm(tplId);
                        break;
                }
            });
        });
    }

    function showRenameTemplateModal(tplId) {
        const tpl = TemplateLibrary.getTemplateById(tplId);
        if (!tpl) return;

        showModal({
            title: '重命名模板',
            body: '<div class="modal-form-group">' +
                    '<label for="rename-tpl-name">模板名称 *</label>' +
                    '<input type="text" id="rename-tpl-name" value="' + escapeHtml(tpl.metadata.name) + '" maxlength="50">' +
                '</div>' +
                '<div class="modal-form-group">' +
                    '<label for="rename-tpl-category">分类</label>' +
                    '<select id="rename-tpl-category">' +
                        '<option value="自定义"' + (tpl.metadata.category === '自定义' ? ' selected' : '') + '>自定义</option>' +
                        '<option value="营销推广"' + (tpl.metadata.category === '营销推广' ? ' selected' : '') + '>营销推广</option>' +
                        '<option value="通知确认"' + (tpl.metadata.category === '通知确认' ? ' selected' : '') + '>通知确认</option>' +
                        '<option value="活动邀请"' + (tpl.metadata.category === '活动邀请' ? ' selected' : '') + '>活动邀请</option>' +
                        '<option value="账户安全"' + (tpl.metadata.category === '账户安全' ? ' selected' : '') + '>账户安全</option>' +
                    '</select>' +
                '</div>',
            buttons: [
                {
                    text: '取消',
                    class: 'btn-secondary',
                    onClick: closeModal
                },
                {
                    text: '确认修改',
                    class: 'btn-primary',
                    style: 'background:#667eea;color:white;',
                    onClick: function() {
                        const newName = document.getElementById('rename-tpl-name').value.trim();
                        const newCategory = document.getElementById('rename-tpl-category').value;
                        if (!newName) {
                            alert('模板名称不能为空');
                            return;
                        }
                        try {
                            TemplateLibrary.updateTemplate(tplId, { name: newName, category: newCategory });
                            closeModal();
                            renderTemplateGrid();
                        } catch (e) {
                            alert(e.message || '修改失败');
                        }
                    }
                }
            ]
        });
    }

    function showDeleteTemplateConfirm(tplId) {
        const tpl = TemplateLibrary.getTemplateById(tplId);
        if (!tpl) return;

        showModal({
            title: '删除模板',
            body: '<p>确定要删除模板 <strong style="color:#ef4444;">' + escapeHtml(tpl.metadata.name) + '</strong> 吗？</p>' +
                '<p style="color:#ef4444;margin-top:12px;">⚠️ 此操作不可撤销，删除后无法恢复。</p>',
            buttons: [
                {
                    text: '取消',
                    class: 'btn-secondary',
                    onClick: closeModal
                },
                {
                    text: '确认删除',
                    class: 'btn-primary',
                    style: 'background:#ef4444;color:white;',
                    onClick: function() {
                        try {
                            TemplateLibrary.deleteTemplate(tplId);
                            closeModal();
                            renderTemplateGrid();
                        } catch (e) {
                            alert(e.message || '删除失败');
                        }
                    }
                }
            ]
        });
    }

    function exportTemplate(tplId) {
        const jsonStr = TemplateLibrary.exportTemplate(tplId);
        if (!jsonStr) {
            alert('导出失败：模板不存在');
            return;
        }

        const tpl = TemplateLibrary.getTemplateById(tplId);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = (tpl.metadata.name || 'template').replace(/[^\w\u4e00-\u9fa5-]/g, '_');
        a.download = 'template_' + safeName + '_' + Date.now() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function showModal(options) {
        const overlay = document.getElementById('template-modal-overlay');
        const titleEl = document.getElementById('modal-title');
        const bodyEl = document.getElementById('modal-body');
        const footerEl = document.getElementById('modal-footer');

        titleEl.textContent = options.title || '提示';
        bodyEl.innerHTML = options.body || '';

        const buttons = options.buttons || [{ text: '确定', class: 'btn-primary', style: 'background:#667eea;color:white;', onClick: closeModal }];
        footerEl.innerHTML = buttons.map(function(btn, idx) {
            const style = btn.style ? ' style="' + btn.style + '"' : '';
            return '<button class="btn ' + (btn.class || 'btn-secondary') + '" data-btn-idx="' + idx + '"' + style + '>' + btn.text + '</button>';
        }).join('');

        footerEl.querySelectorAll('button').forEach(function(btnEl) {
            const idx = parseInt(btnEl.dataset.btnIdx);
            btnEl.addEventListener('click', buttons[idx].onClick);
        });

        overlay.classList.remove('hidden');

        if (options.onMounted) {
            setTimeout(options.onMounted, 10);
        }
    }

    function closeModal() {
        document.getElementById('template-modal-overlay').classList.add('hidden');
    }

    function bindModalEvents() {
        document.getElementById('modal-close-btn').addEventListener('click', closeModal);
        document.getElementById('template-modal-overlay').addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                const overlay = document.getElementById('template-modal-overlay');
                if (!overlay.classList.contains('hidden')) {
                    closeModal();
                }
                const ctxMenu = document.getElementById('template-context-menu');
                if (!ctxMenu.classList.contains('hidden')) {
                    ctxMenu.classList.add('hidden');
                }
            }
        });
    }

    function setViewToggle(view) {
        PreviewRenderer.setView(view);
        document.querySelectorAll('.btn-toggle').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
    }

    function renderEditor() {
        const canvas = document.getElementById('editor-canvas');
        const state = LayoutManager.getState();

        if (state.blocks.length === 0) {
            canvas.innerHTML = '<div class="empty-hint"><p>👈 从左侧拖拽组件到这里开始编辑</p></div>';
            return;
        }

        let html = '';
        state.blocks.forEach(function(block, index) {
            const isSelected = block.id === state.selectedId && !state.selectedColId;
            html += renderBlockWrapper(block, index, isSelected);
        });

        canvas.innerHTML = html;
        bindBlockEvents(canvas);
    }

    function renderBlockWrapper(block, index, isSelected) {
        var wrapperClass = 'block-wrapper' + (isSelected ? ' selected' : '');
        var content = '';

        if (block.type === 'columns') {
            content = renderColumnsEditor(block);
        } else {
            content = '<div class="block-content">' + TemplateEngine.renderEditorBlock(block) + '</div>';
        }

        return '<div class="' + wrapperClass + '" data-block-id="' + block.id + '" data-block-index="' + index + '" draggable="false">' +
            '<div class="block-drag-handle" draggable="true" title="拖拽排序">⋮⋮</div>' +
            '<div class="block-actions">' +
                '<button class="block-action-btn duplicate" title="复制" data-action="duplicate">📋</button>' +
                '<button class="block-action-btn delete" title="删除" data-action="delete">🗑️</button>' +
            '</div>' +
            content +
        '</div>';
    }

    function renderColumnsEditor(block) {
        var d = block.data;
        var cols = d.columns || 2;
        var state = LayoutManager.getState();
        var colsHtml = '';

        for (var i = 0; i < cols; i++) {
            var col = d.children[i];
            if (!col) continue;

            var isColSelected = state.selectedId && state.selectedColId === col.id;
            var colClass = 'mj-column' + (isColSelected ? ' column-selected' : '');
            var colContent = '';

            if (col.blocks && col.blocks.length > 0) {
                col.blocks.forEach(function(childBlock, childIndex) {
                    var isChildSelected = state.selectedId === childBlock.id;
                    colContent += renderChildBlockWrapper(childBlock, childIndex, block.id, col.id, isChildSelected);
                });
            }

            if (colContent === '') {
                colContent = '<div class="column-empty-hint"><p>👈 拖拽组件到这里</p></div>';
            }

            colsHtml += '<div class="' + colClass + '" data-col-id="' + col.id + '" data-parent-block-id="' + block.id + '" data-col-index="' + i + '">' +
                '<div class="column-header">第' + (i + 1) + '栏</div>' +
                '<div class="column-content" data-col-id="' + col.id + '" data-parent-block-id="' + block.id + '">' +
                    colContent +
                '</div>' +
            '</div>';
        }

        return '<div class="block-content"><div class="mj-column-wrapper">' + colsHtml + '</div></div>';
    }

    function renderChildBlockWrapper(block, index, parentBlockId, colId, isSelected) {
        var wrapperClass = 'child-block-wrapper' + (isSelected ? ' selected' : '');
        var content = TemplateEngine.renderEditorBlock(block);

        return '<div class="' + wrapperClass + '" data-block-id="' + block.id + '" data-block-index="' + index + '"' +
            ' data-parent-block-id="' + parentBlockId + '" data-col-id="' + colId + '" draggable="false">' +
            '<div class="child-block-drag-handle" draggable="true" title="拖拽排序">⋮⋮</div>' +
            '<div class="child-block-actions">' +
                '<button class="block-action-btn duplicate" title="复制" data-action="duplicate">📋</button>' +
                '<button class="block-action-btn delete" title="删除" data-action="delete">🗑️</button>' +
            '</div>' +
            '<div class="block-content">' + content + '</div>' +
        '</div>';
    }

    function bindBlockEvents(canvas) {
        canvas.querySelectorAll('.block-wrapper').forEach(function(wrapper) {
            const blockId = wrapper.dataset.blockId;
            const handle = wrapper.querySelector('.block-drag-handle');

            handle.addEventListener('dragstart', function(e) {
                e.stopPropagation();
                draggingType = null;
                draggingBlockId = blockId;
                draggingParentBlockId = null;
                draggingColId = null;
                wrapper.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', blockId);
            });

            handle.addEventListener('dragend', function(e) {
                wrapper.classList.remove('dragging');
                clearDragState();
                clearDragOver();
            });

            wrapper.addEventListener('dragover', function(e) {
                if (!draggingBlockId && !draggingType) return;
                if (draggingParentBlockId) return;
                e.preventDefault();
                e.stopPropagation();

                const rect = wrapper.getBoundingClientRect();
                const midPoint = rect.top + rect.height / 2;
                const position = e.clientY < midPoint ? 'top' : 'bottom';

                setDragOver(wrapper, position, {
                    type: 'main',
                    blockId: blockId,
                    position: position
                });
            });

            wrapper.addEventListener('dragleave', function(e) {
                if (!wrapper.contains(e.relatedTarget)) {
                    wrapper.classList.remove('drag-over-top', 'drag-over-bottom');
                }
            });

            wrapper.addEventListener('drop', function(e) {
                e.preventDefault();
                e.stopPropagation();
                clearDragOver();

                const targetIndex = LayoutManager.getBlockIndex(blockId);
                const pos = dragOverTarget && dragOverTarget.position;
                const insertIndex = pos === 'top' ? targetIndex : targetIndex + 1;

                if (draggingType && !draggingBlockId) {
                    const block = ComponentLibrary.createBlock(draggingType);
                    LayoutManager.addBlock(block, insertIndex);
                } else if (draggingBlockId && !draggingParentBlockId && draggingBlockId !== blockId) {
                    const fromIndex = LayoutManager.getBlockIndex(draggingBlockId);
                    LayoutManager.moveBlock(fromIndex, insertIndex);
                }
                clearDragState();
            });

            wrapper.querySelector('.block-content').addEventListener('click', function(e) {
                const childWrapper = e.target.closest('.child-block-wrapper');
                const column = e.target.closest('.mj-column');
                if (childWrapper) return;
                e.stopPropagation();
                LayoutManager.selectBlock(blockId, null);
            });

            wrapper.querySelectorAll('.block-action-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const action = btn.dataset.action;
                    if (action === 'delete') {
                        if (confirm('确定要删除这个区块吗？')) {
                            LayoutManager.removeBlock(blockId);
                        }
                    } else if (action === 'duplicate') {
                        LayoutManager.duplicateBlock(blockId);
                    }
                });
            });
        });

        bindColumnEvents(canvas);
        bindChildBlockEvents(canvas);
    }

    function bindColumnEvents(canvas) {
        canvas.querySelectorAll('.mj-column').forEach(function(column) {
            const parentBlockId = column.dataset.parentBlockId;
            const colId = column.dataset.colId;

            column.addEventListener('click', function(e) {
                const childWrapper = e.target.closest('.child-block-wrapper');
                if (childWrapper) return;
                e.stopPropagation();
                const state = LayoutManager.getState();
                if (state.selectedColId !== colId) {
                    LayoutManager.selectBlock(null, colId);
                }
            });

            const content = column.querySelector('.column-content');
            if (content) {
                content.addEventListener('dragover', function(e) {
                    if (!draggingType && !draggingBlockId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    content.classList.add('drag-over');
                    setDragOver(content, 'bottom', {
                        type: 'column',
                        parentBlockId: parentBlockId,
                        colId: colId,
                        position: 'bottom'
                    });
                });

                content.addEventListener('dragleave', function(e) {
                    if (!content.contains(e.relatedTarget)) {
                        content.classList.remove('drag-over');
                    }
                });

                content.addEventListener('drop', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    content.classList.remove('drag-over');
                    clearDragOver();

                    if (draggingType && !draggingBlockId) {
                        const block = ComponentLibrary.createBlock(draggingType);
                        LayoutManager.addBlockToColumn(parentBlockId, colId, block);
                    } else if (draggingBlockId && draggingParentBlockId === parentBlockId && draggingColId === colId) {
                    } else if (draggingBlockId && draggingParentBlockId) {
                    } else if (draggingBlockId && !draggingParentBlockId) {
                        const block = LayoutManager.getState().blocks.find(b => b.id === draggingBlockId);
                        if (block && block.type !== 'columns') {
                            const newBlock = JSON.parse(JSON.stringify(block));
                            newBlock.id = 'block_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                            LayoutManager.addBlockToColumn(parentBlockId, colId, newBlock);
                            LayoutManager.removeBlock(draggingBlockId);
                        }
                    }
                    clearDragState();
                });
            }
        });
    }

    function bindChildBlockEvents(canvas) {
        canvas.querySelectorAll('.child-block-wrapper').forEach(function(wrapper) {
            const blockId = wrapper.dataset.blockId;
            const parentBlockId = wrapper.dataset.parentBlockId;
            const colId = wrapper.dataset.colId;
            const handle = wrapper.querySelector('.child-block-drag-handle');

            handle.addEventListener('dragstart', function(e) {
                e.stopPropagation();
                draggingType = null;
                draggingBlockId = blockId;
                draggingParentBlockId = parentBlockId;
                draggingColId = colId;
                wrapper.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', blockId);
            });

            handle.addEventListener('dragend', function(e) {
                wrapper.classList.remove('dragging');
                clearDragState();
                clearDragOver();
            });

            wrapper.addEventListener('dragover', function(e) {
                if (!draggingType && !draggingBlockId) return;
                if (draggingParentBlockId && draggingParentBlockId !== parentBlockId) return;
                if (draggingParentBlockId && draggingColId !== colId) return;
                e.preventDefault();
                e.stopPropagation();

                const rect = wrapper.getBoundingClientRect();
                const midPoint = rect.top + rect.height / 2;
                const position = e.clientY < midPoint ? 'top' : 'bottom';

                setDragOver(wrapper, position, {
                    type: 'child',
                    parentBlockId: parentBlockId,
                    colId: colId,
                    blockId: blockId,
                    position: position
                });
            });

            wrapper.addEventListener('dragleave', function(e) {
                if (!wrapper.contains(e.relatedTarget)) {
                    wrapper.classList.remove('drag-over-top', 'drag-over-bottom');
                }
            });

            wrapper.addEventListener('drop', function(e) {
                e.preventDefault();
                e.stopPropagation();
                clearDragOver();

                const childIndex = LayoutManager.getColumnBlockIndex(parentBlockId, colId, blockId);
                const pos = dragOverTarget && dragOverTarget.position;
                const insertIndex = pos === 'top' ? childIndex : childIndex + 1;

                if (draggingType && !draggingBlockId) {
                    const block = ComponentLibrary.createBlock(draggingType);
                    LayoutManager.addBlockToColumn(parentBlockId, colId, block, insertIndex);
                } else if (draggingBlockId && draggingParentBlockId === parentBlockId && draggingColId === colId && draggingBlockId !== blockId) {
                    const fromIndex = LayoutManager.getColumnBlockIndex(parentBlockId, colId, draggingBlockId);
                    LayoutManager.moveBlockInColumn(parentBlockId, colId, fromIndex, insertIndex);
                }
                clearDragState();
            });

            wrapper.querySelector('.block-content').addEventListener('click', function(e) {
                e.stopPropagation();
                LayoutManager.selectBlock(blockId, colId);
            });

            wrapper.querySelectorAll('.block-action-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const action = btn.dataset.action;
                    if (action === 'delete') {
                        if (confirm('确定要删除这个组件吗？')) {
                            LayoutManager.removeBlockFromColumn(parentBlockId, colId, blockId);
                        }
                    } else if (action === 'duplicate') {
                        LayoutManager.duplicateColumnBlock(parentBlockId, colId, blockId);
                    }
                });
            });
        });
    }

    function setDragOver(element, position, target) {
        clearDragOver();
        dragOverTarget = target;
        if (position === 'top') {
            element.classList.add('drag-over-top');
        } else {
            element.classList.add('drag-over-bottom');
        }
    }

    function clearDragOver() {
        document.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over').forEach(function(el) {
            el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over');
        });
        dragOverTarget = null;
    }

    function clearDragState() {
        draggingType = null;
        draggingBlockId = null;
        draggingParentBlockId = null;
        draggingColId = null;
    }

    function renderProperties() {
        const container = document.getElementById('properties-content');
        const state = LayoutManager.getState();

        if (!state.selectedId && !state.selectedColId) {
            container.innerHTML = '<p class="empty-hint">点击组件编辑属性</p>';
            return;
        }

        if (state.selectedColId && !state.selectedId) {
            container.innerHTML = renderColumnProperties(state.selectedColId);
            return;
        }

        const info = LayoutManager.findBlockByIdRecursive(state.selectedId);
        if (!info) {
            container.innerHTML = '<p class="empty-hint">点击组件编辑属性</p>';
            return;
        }

        const block = info.block;
        const comp = ComponentLibrary.getComponent(block.type);
        if (!comp) {
            container.innerHTML = '<p class="empty-hint">未知组件类型</p>';
            return;
        }

        let html = '<h4 style="margin-bottom:8px;color:#374151;">' + comp.icon + ' ' + comp.label + ' 属性</h4>';

        comp.fields.forEach(function(field) {
            if (field.type === 'group') {
                html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;">' +
                    '<div style="font-size:12px;color:#6b7280;margin-bottom:6px;font-weight:600;">' + field.label + '</div>' +
                    '<div class="form-row">';
                field.fields.forEach(function(subField) {
                    html += renderFormField(subField, block.data[subField.key]);
                });
                html += '</div></div>';
            } else {
                html += renderFormField(field, block.data[field.key]);
            }
        });

        container.innerHTML = html;

        if (info.parentBlockId && info.colId) {
            bindFieldEvents(container, block.id, info.parentBlockId, info.colId);
        } else {
            bindFieldEvents(container, block.id, null, null);
        }
    }

    function renderColumnProperties(colId) {
        const state = LayoutManager.getState();
        let colInfo = null;
        let parentBlock = null;

        for (let i = 0; i < state.blocks.length; i++) {
            const b = state.blocks[i];
            if (b.type === 'columns' && b.data.children) {
                for (let j = 0; j < b.data.children.length; j++) {
                    if (b.data.children[j].id === colId) {
                        colInfo = b.data.children[j];
                        parentBlock = b;
                        break;
                    }
                }
            }
        }

        if (!colInfo || !parentBlock) {
            return '<p class="empty-hint">点击组件编辑属性</p>';
        }

        const blockCount = colInfo.blocks ? colInfo.blocks.length : 0;
        const colIndex = parentBlock.data.children.findIndex(c => c.id === colId);

        return '<h4 style="margin-bottom:8px;color:#374151;">📊 第' + (colIndex + 1) + '栏</h4>' +
            '<div style="font-size:13px;color:#6b7280;line-height:1.6;">' +
                '<p><strong>栏内组件数：</strong>' + blockCount + ' 个</p>' +
                '<p style="margin-top:8px;">从左侧拖拽组件到该栏即可添加。</p>' +
                '<p style="margin-top:8px;">点击栏内组件可编辑其属性。</p>' +
            '</div>';
    }

    function renderFormField(field, value) {
        var inputId = 'field-' + field.key;
        switch (field.type) {
            case 'text':
            case 'number':
                var step = field.step ? ' step="' + field.step + '"' : '';
                return '<div class="form-group">' +
                    '<label for="' + inputId + '">' + field.label + '</label>' +
                    '<input type="' + field.type + '" id="' + inputId + '" data-field="' + field.key + '" value="' + (value !== undefined ? value : '') + '"' + step + '>' +
                '</div>';
            case 'textarea':
                return '<div class="form-group">' +
                    '<label for="' + inputId + '">' + field.label + '</label>' +
                    '<textarea id="' + inputId + '" data-field="' + field.key + '">' + (value !== undefined ? value : '') + '</textarea>' +
                '</div>';
            case 'select':
                var options = field.options.map(function(opt) {
                    return '<option value="' + opt.value + '" ' + (value == opt.value ? 'selected' : '') + '>' + opt.label + '</option>';
                }).join('');
                return '<div class="form-group">' +
                    '<label for="' + inputId + '">' + field.label + '</label>' +
                    '<select id="' + inputId + '" data-field="' + field.key + '">' + options + '</select>' +
                '</div>';
            case 'color':
                return '<div class="form-group">' +
                    '<label for="' + inputId + '">' + field.label + '</label>' +
                    '<input type="color" id="' + inputId + '" data-field="' + field.key + '" value="' + (value || '#000000') + '">' +
                '</div>';
            default:
                return '';
        }
    }

    function bindFieldEvents(container, blockId, parentBlockId, colId) {
        container.querySelectorAll('[data-field]').forEach(function(input) {
            var field = input.dataset.field;

            input.addEventListener('input', function(e) {
                var value = e.target.value;
                if (input.type === 'number') {
                    value = parseFloat(value) || 0;
                }

                if (parentBlockId && colId) {
                    LayoutManager.updateColumnBlock(parentBlockId, colId, blockId, {});
                    LayoutManager.updateColumnBlock(parentBlockId, colId, blockId, { [field]: value });
                } else {
                    LayoutManager.updateBlock(blockId, { [field]: value });
                }
            });

            if (input.tagName === 'SELECT') {
                input.addEventListener('change', function(e) {
                    var value = e.target.value;
                    if (!isNaN(parseFloat(value)) && isFinite(value)) {
                        value = parseFloat(value);
                    }
                    if (field === 'columns' && !parentBlockId) {
                        LayoutManager.handleColumnCountChange(blockId, value);
                    } else if (parentBlockId && colId) {
                        LayoutManager.updateColumnBlock(parentBlockId, colId, blockId, { [field]: value });
                    } else {
                        LayoutManager.updateBlock(blockId, { [field]: value });
                    }
                });
            }
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    return { init: init };
})();

document.addEventListener('DOMContentLoaded', function() {
    App.init();
});
