const App = (() => {

    let draggingType = null;
    let draggingBlockId = null;
    let draggingParentBlockId = null;
    let draggingColId = null;
    let dragOverTarget = null;

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

        renderComponentList();
        bindGlobalEvents();
        renderEditor();
        PreviewRenderer.render(initialState.blocks);
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

            if (!blockWrapper && !childWrapper && !column && !properties && !componentItem) {
                LayoutManager.selectBlock(null, null);
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

    return { init: init };
})();

document.addEventListener('DOMContentLoaded', function() {
    App.init();
});
