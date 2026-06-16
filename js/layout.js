const LayoutManager = (() => {

    let mainList = null;
    let onChangeCallback = null;
    let onSelectCallback = null;
    let selectedColId = null;

    function init(initialState, callbacks) {
        onChangeCallback = callbacks.onChange || (() => {});
        onSelectCallback = callbacks.onSelect || (() => {});

        mainList = BlockListManager.createManager(
            initialState.blocks || [],
            onMainListChange
        );

        selectedColId = null;
    }

    function onMainListChange(blocks) {
        onChangeCallback(getState());
    }

    function getState() {
        return {
            blocks: mainList.getBlocks(),
            selectedId: mainList.getSelectedId(),
            selectedColId: selectedColId
        };
    }

    function setState(newState) {
        mainList.setBlocks(newState.blocks || []);
        mainList.setSelectedId(newState.selectedId || null);
        selectedColId = newState.selectedColId || null;
        onChangeCallback(getState());
    }

    function selectBlock(blockId, colId) {
        mainList.setSelectedId(blockId);
        selectedColId = colId || null;
        onSelectCallback(blockId, colId);
    }

    function getSelectedInfo() {
        return {
            blockId: mainList.getSelectedId(),
            colId: selectedColId
        };
    }

    function getSelectedBlock() {
        return mainList.getSelectedBlock();
    }

    function getBlockIndex(blockId) {
        return mainList.getBlockIndex(blockId);
    }

    function addBlock(block, targetIndex) {
        mainList.addBlock(block, targetIndex);
    }

    function removeBlock(blockId) {
        mainList.removeBlock(blockId);
        if (selectedColId && !mainList.getBlockById(blockId)) {
            selectedColId = null;
        }
    }

    function moveBlock(fromIndex, toIndex) {
        mainList.moveBlock(fromIndex, toIndex);
    }

    function updateBlock(blockId, data) {
        mainList.updateBlock(blockId, data);
    }

    function duplicateBlock(blockId) {
        mainList.duplicateBlock(blockId);
    }

    function clearAll() {
        mainList.clear();
        selectedColId = null;
        selectBlock(null, null);
    }

    function syncColumnBlocksToMain(blockId, colId, newColumnBlocks) {
        const currentBlocks = mainList.getBlocks();
        const newBlocks = currentBlocks.map(function(b) {
            if (b.id !== blockId) return b;
            if (b.type !== 'columns') return b;

            const newChildren = b.data.children.map(function(col) {
                if (col.id !== colId) return col;
                return { ...col, blocks: newColumnBlocks };
            });

            return {
                ...b,
                data: { ...b.data, children: newChildren }
            };
        });

        mainList.setBlocks(newBlocks);
    }

    function getColumnManager(blockId, colId) {
        const block = mainList.getBlockById(blockId);
        if (!block || block.type !== 'columns') return null;

        const col = block.data.children.find(function(c) { return c.id === colId; });
        if (!col) return null;

        const onChange = function(newColumnBlocks) {
            syncColumnBlocksToMain(blockId, colId, newColumnBlocks);
        };

        return BlockListManager.createManager(
            JSON.parse(JSON.stringify(col.blocks || [])),
            onChange
        );
    }

    function addBlockToColumn(blockId, colId, newBlock, targetIndex) {
        const colMgr = getColumnManager(blockId, colId);
        if (!colMgr) return;
        colMgr.addBlock(newBlock, targetIndex);
    }

    function removeBlockFromColumn(blockId, colId, childBlockId) {
        const colMgr = getColumnManager(blockId, colId);
        if (!colMgr) return;
        colMgr.removeBlock(childBlockId);

        const selected = getSelectedInfo();
        if (selected.blockId === childBlockId) {
            selectBlock(null, null);
        }
    }

    function moveBlockInColumn(blockId, colId, fromIndex, toIndex) {
        const colMgr = getColumnManager(blockId, colId);
        if (!colMgr) return;
        colMgr.moveBlock(fromIndex, toIndex);
    }

    function updateColumnBlock(blockId, colId, childBlockId, data) {
        const colMgr = getColumnManager(blockId, colId);
        if (!colMgr) return;
        colMgr.updateBlock(childBlockId, data);
    }

    function duplicateColumnBlock(blockId, colId, childBlockId) {
        const colMgr = getColumnManager(blockId, colId);
        if (!colMgr) return;
        colMgr.duplicateBlock(childBlockId);
    }

    function getColumnBlockIndex(blockId, colId, childBlockId) {
        const colMgr = getColumnManager(blockId, colId);
        if (!colMgr) return -1;
        return colMgr.getBlockIndex(childBlockId);
    }

    function handleColumnCountChange(blockId, newCount) {
        const block = mainList.getBlockById(blockId);
        if (!block || block.type !== 'columns') return;

        const targetCount = parseInt(newCount);
        const newChildren = JSON.parse(JSON.stringify(block.data.children || []));

        while (newChildren.length < targetCount) {
            newChildren.push({
                id: 'col_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                blocks: []
            });
        }
        while (newChildren.length > targetCount) {
            newChildren.pop();
        }

        updateBlock(blockId, { columns: targetCount, children: newChildren });
    }

    function findBlockByIdRecursive(blockId) {
        let result = mainList.getBlockById(blockId);
        if (result) {
            return { block: result, parentBlockId: null, colId: null };
        }

        const blocks = mainList.getBlocks();
        for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i];
            if (b.type === 'columns' && b.data.children) {
                for (let j = 0; j < b.data.children.length; j++) {
                    const col = b.data.children[j];
                    if (col.blocks) {
                        const found = col.blocks.find(function(cb) { return cb.id === blockId; });
                        if (found) {
                            return { block: found, parentBlockId: b.id, colId: col.id };
                        }
                    }
                }
            }
        }

        return null;
    }

    function updateAnyBlock(blockId, data) {
        const info = findBlockByIdRecursive(blockId);
        if (!info) return;

        if (info.parentBlockId && info.colId) {
            updateColumnBlock(info.parentBlockId, info.colId, blockId, data);
        } else {
            updateBlock(blockId, data);
        }
    }

    function deleteAnyBlock(blockId) {
        const info = findBlockByIdRecursive(blockId);
        if (!info) return;

        if (info.parentBlockId && info.colId) {
            removeBlockFromColumn(info.parentBlockId, info.colId, blockId);
        } else {
            removeBlock(blockId);
        }
    }

    function duplicateAnyBlock(blockId) {
        const info = findBlockByIdRecursive(blockId);
        if (!info) return;

        if (info.parentBlockId && info.colId) {
            duplicateColumnBlock(info.parentBlockId, info.colId, blockId);
        } else {
            duplicateBlock(blockId);
        }
    }

    function selectAnyBlock(blockId) {
        const info = findBlockByIdRecursive(blockId);
        if (!info) {
            selectBlock(null, null);
            return;
        }
        selectBlock(blockId, info.colId);
    }

    return {
        init,
        getState,
        setState,
        selectBlock,
        selectAnyBlock,
        getSelectedInfo,
        getSelectedBlock,
        getBlockIndex,
        addBlock,
        removeBlock,
        moveBlock,
        updateBlock,
        duplicateBlock,
        clearAll,
        getColumnManager,
        addBlockToColumn,
        removeBlockFromColumn,
        moveBlockInColumn,
        updateColumnBlock,
        duplicateColumnBlock,
        getColumnBlockIndex,
        handleColumnCountChange,
        findBlockByIdRecursive,
        updateAnyBlock,
        deleteAnyBlock,
        duplicateAnyBlock
    };
})();
