const BlockListManager = (() => {

    function createManager(initialBlocks, onChange) {
        let blocks = initialBlocks || [];
        let selectedId = null;

        function getBlocks() {
            return blocks;
        }

        function setBlocks(newBlocks) {
            blocks = newBlocks;
            if (onChange) onChange(blocks);
        }

        function getSelectedId() {
            return selectedId;
        }

        function setSelectedId(id) {
            selectedId = id;
            if (onChange) onChange(blocks);
        }

        function getSelectedBlock() {
            if (!selectedId) return null;
            return blocks.find(b => b.id === selectedId) || null;
        }

        function addBlock(block, targetIndex) {
            const newBlocks = [...blocks];
            if (targetIndex === null || targetIndex === undefined || targetIndex >= newBlocks.length) {
                newBlocks.push(block);
            } else if (targetIndex < 0) {
                newBlocks.unshift(block);
            } else {
                newBlocks.splice(targetIndex, 0, block);
            }
            setBlocks(newBlocks);
        }

        function removeBlock(blockId) {
            const newBlocks = blocks.filter(b => b.id !== blockId);
            if (selectedId === blockId) {
                selectedId = null;
            }
            setBlocks(newBlocks);
        }

        function moveBlock(fromIndex, toIndex) {
            if (fromIndex === toIndex) return;
            const newBlocks = [...blocks];
            const [removed] = newBlocks.splice(fromIndex, 1);
            const insertIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
            newBlocks.splice(insertIndex, 0, removed);
            setBlocks(newBlocks);
        }

        function updateBlock(blockId, data) {
            const newBlocks = blocks.map(b => {
                if (b.id === blockId) {
                    return { ...b, data: { ...b.data, ...data } };
                }
                return b;
            });
            setBlocks(newBlocks);
        }

        function getBlockIndex(blockId) {
            return blocks.findIndex(b => b.id === blockId);
        }

        function getBlockById(blockId) {
            return blocks.find(b => b.id === blockId) || null;
        }

        function duplicateBlock(blockId) {
            const index = getBlockIndex(blockId);
            if (index === -1) return;
            const original = blocks[index];
            const copy = JSON.parse(JSON.stringify(original));
            copy.id = 'block_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

            function regenerateIds(obj) {
                if (obj && typeof obj === 'object') {
                    if (obj.id) {
                        obj.id = 'block_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                    }
                    if (obj.data && obj.data.children) {
                        obj.data.children = obj.data.children.map(col => {
                            if (col.blocks) {
                                col.blocks = col.blocks.map(b => {
                                    const nb = JSON.parse(JSON.stringify(b));
                                    regenerateIds(nb);
                                    return nb;
                                });
                            }
                            return col;
                        });
                    }
                }
            }
            regenerateIds(copy);

            addBlock(copy, index + 1);
        }

        function clear() {
            setBlocks([]);
            selectedId = null;
        }

        return {
            getBlocks,
            setBlocks,
            getSelectedId,
            setSelectedId,
            getSelectedBlock,
            addBlock,
            removeBlock,
            moveBlock,
            updateBlock,
            getBlockIndex,
            getBlockById,
            duplicateBlock,
            clear
        };
    }

    return { createManager };
})();
