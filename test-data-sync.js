const fs = require('fs');
const path = require('path');

// Mock minimal browser globals
global.window = global;

// Load modules via eval in order
function loadModule(filePath) {
    const code = fs.readFileSync(filePath, 'utf-8');
    const wrapped = code + '\n' +
        'if (typeof BlockListManager !== "undefined") global.BlockListManager = BlockListManager;' +
        'if (typeof ComponentLibrary !== "undefined") global.ComponentLibrary = ComponentLibrary;' +
        'if (typeof LayoutManager !== "undefined") global.LayoutManager = LayoutManager;';
    eval(wrapped);
}

loadModule(path.join(__dirname, 'js/blockList.js'));
loadModule(path.join(__dirname, 'js/components.js'));
loadModule(path.join(__dirname, 'js/layout.js'));

console.log('\n=== 多栏布局数据同步测试 ===\n');

let passCount = 0;
let failCount = 0;

function assert(condition, msg) {
    if (condition) {
        passCount++;
        console.log('   ✅ PASS:', msg);
    } else {
        failCount++;
        console.log('   ❌ FAIL:', msg);
    }
}

// ---------- Test 1: 基本数据同步 - addBlockToColumn ----------
console.log('1. 测试 addBlockToColumn 数据同步:');
(function test1() {
    let changeCount = 0;
    let lastState = null;

    LayoutManager.init({ blocks: [], selectedId: null }, {
        onChange: function(state) {
            changeCount++;
            lastState = state;
        },
        onSelect: function() {}
    });

    const columnsBlock = ComponentLibrary.createBlock('columns');
    LayoutManager.addBlock(columnsBlock, 0);

    assert(changeCount === 1, 'addBlock 触发一次 onChange');

    const blockId = columnsBlock.id;
    const colId = columnsBlock.data.children[0].id;

    const imgBlock = ComponentLibrary.createBlock('image');
    LayoutManager.addBlockToColumn(blockId, colId, imgBlock);

    const state = LayoutManager.getState();
    const columnInState = state.blocks.find(b => b.id === blockId);
    const col0Blocks = columnInState.data.children[0].blocks;

    assert(col0Blocks.length === 1, '栏内成功添加 1 个组件');
    assert(col0Blocks[0].id === imgBlock.id, '栏内组件 ID 正确');
    assert(col0Blocks[0].type === 'image', '栏内组件类型正确');
    assert(changeCount === 2, 'addBlockToColumn 再次触发 onChange');
})();

// ---------- Test 2: updateColumnBlock 数据同步 ----------
console.log('\n2. 测试 updateColumnBlock 数据同步:');
(function test2() {
    LayoutManager.init({ blocks: [], selectedId: null }, {
        onChange: function() {},
        onSelect: function() {}
    });

    const columnsBlock = ComponentLibrary.createBlock('columns');
    LayoutManager.addBlock(columnsBlock, 0);

    const blockId = columnsBlock.id;
    const colId = columnsBlock.data.children[0].id;

    const btnBlock = ComponentLibrary.createBlock('button');
    LayoutManager.addBlockToColumn(blockId, colId, btnBlock);

    LayoutManager.updateColumnBlock(blockId, colId, btnBlock.id, {
        text: '点击我!',
        bgColor: '#ff0000'
    });

    const state = LayoutManager.getState();
    const updatedBtn = state.blocks
        .find(b => b.id === blockId)
        .data.children[0].blocks.find(x => x.id === btnBlock.id);

    assert(updatedBtn.data.text === '点击我!', '栏内按钮 text 属性更新正确');
    assert(updatedBtn.data.bgColor === '#ff0000', '栏内按钮 bgColor 属性更新正确');
})();

// ---------- Test 3: removeBlockFromColumn 数据同步 ----------
console.log('\n3. 测试 removeBlockFromColumn 数据同步:');
(function test3() {
    LayoutManager.init({ blocks: [], selectedId: null }, {
        onChange: function() {},
        onSelect: function() {}
    });

    const columnsBlock = ComponentLibrary.createBlock('columns');
    LayoutManager.addBlock(columnsBlock, 0);

    const blockId = columnsBlock.id;
    const colId = columnsBlock.data.children[0].id;

    const b1 = ComponentLibrary.createBlock('heading');
    const b2 = ComponentLibrary.createBlock('paragraph');
    const b3 = ComponentLibrary.createBlock('divider');

    LayoutManager.addBlockToColumn(blockId, colId, b1);
    LayoutManager.addBlockToColumn(blockId, colId, b2);
    LayoutManager.addBlockToColumn(blockId, colId, b3);

    let colBlocks;
    colBlocks = LayoutManager.getState()
        .blocks.find(b => b.id === blockId)
        .data.children[0].blocks;
    assert(colBlocks.length === 3, '栏内初始 3 个组件');

    LayoutManager.removeBlockFromColumn(blockId, colId, b2.id);

    colBlocks = LayoutManager.getState()
        .blocks.find(b => b.id === blockId)
        .data.children[0].blocks;

    assert(colBlocks.length === 2, '删除后栏内剩余 2 个组件');
    assert(colBlocks[0].id === b1.id, '第一个组件仍为 heading');
    assert(colBlocks[1].id === b3.id, '第二个组件仍为 divider');
    assert(!colBlocks.find(x => x.id === b2.id), '被删除组件确实不在栏内');
})();

// ---------- Test 4: moveBlockInColumn 数据同步 ----------
console.log('\n4. 测试 moveBlockInColumn 数据同步:');
(function test4() {
    LayoutManager.init({ blocks: [], selectedId: null }, {
        onChange: function() {},
        onSelect: function() {}
    });

    const columnsBlock = ComponentLibrary.createBlock('columns');
    LayoutManager.addBlock(columnsBlock, 0);

    const blockId = columnsBlock.id;
    const colId = columnsBlock.data.children[0].id;

    const b1 = ComponentLibrary.createBlock('heading');
    const b2 = ComponentLibrary.createBlock('paragraph');
    const b3 = ComponentLibrary.createBlock('button');

    LayoutManager.addBlockToColumn(blockId, colId, b1);
    LayoutManager.addBlockToColumn(blockId, colId, b2);
    LayoutManager.addBlockToColumn(blockId, colId, b3);

    LayoutManager.moveBlockInColumn(blockId, colId, 0, 3); // 把第1个移到末尾

    const colBlocks = LayoutManager.getState()
        .blocks.find(b => b.id === blockId)
        .data.children[0].blocks;

    assert(colBlocks[0].id === b2.id, '移动后第一个是 paragraph');
    assert(colBlocks[1].id === b3.id, '移动后第二个是 button');
    assert(colBlocks[2].id === b1.id, '移动后第三个是 heading');
})();

// ---------- Test 5: duplicateColumnBlock 数据同步 ----------
console.log('\n5. 测试 duplicateColumnBlock 数据同步:');
(function test5() {
    LayoutManager.init({ blocks: [], selectedId: null }, {
        onChange: function() {},
        onSelect: function() {}
    });

    const columnsBlock = ComponentLibrary.createBlock('columns');
    LayoutManager.addBlock(columnsBlock, 0);

    const blockId = columnsBlock.id;
    const colId = columnsBlock.data.children[0].id;

    const img = ComponentLibrary.createBlock('image');
    img.data.src = 'https://example.com/test.png';
    LayoutManager.addBlockToColumn(blockId, colId, img);

    LayoutManager.duplicateColumnBlock(blockId, colId, img.id);

    const colBlocks = LayoutManager.getState()
        .blocks.find(b => b.id === blockId)
        .data.children[0].blocks;

    assert(colBlocks.length === 2, '复制后栏内有 2 个组件');
    assert(colBlocks[0].id === img.id, '第一个仍是原图');
    assert(colBlocks[1].id !== img.id, '复制出的组件 ID 不同');
    assert(colBlocks[1].type === 'image', '复制出的组件类型正确');
    assert(colBlocks[1].data.src === 'https://example.com/test.png', '复制出的组件属性正确');
})();

// ---------- Test 6: 多栏 + 多组件混合持久化 ----------
console.log('\n6. 测试多栏多组件混合场景:');
(function test6() {
    LayoutManager.init({ blocks: [], selectedId: null }, {
        onChange: function() {},
        onSelect: function() {}
    });

    // 添加一个普通标题
    const topHeading = ComponentLibrary.createBlock('heading');
    LayoutManager.addBlock(topHeading, 0);

    // 添加多栏布局
    const columnsBlock = ComponentLibrary.createBlock('columns');
    LayoutManager.addBlock(columnsBlock, 1);

    // 在第1栏添加标题+按钮
    const col0Id = columnsBlock.data.children[0].id;
    const col1Id = columnsBlock.data.children[1].id;

    const col0Heading = ComponentLibrary.createBlock('heading');
    col0Heading.data.text = '左栏标题';
    const col0Btn = ComponentLibrary.createBlock('button');
    col0Btn.data.text = '立即购买';

    LayoutManager.addBlockToColumn(columnsBlock.id, col0Id, col0Heading);
    LayoutManager.addBlockToColumn(columnsBlock.id, col0Id, col0Btn);

    // 在第2栏添加图片+段落
    const col1Img = ComponentLibrary.createBlock('image');
    const col1Para = ComponentLibrary.createBlock('paragraph');

    LayoutManager.addBlockToColumn(columnsBlock.id, col1Id, col1Img);
    LayoutManager.addBlockToColumn(columnsBlock.id, col1Id, col1Para);

    // 再添加一个底部分隔线
    const bottomDivider = ComponentLibrary.createBlock('divider');
    LayoutManager.addBlock(bottomDivider, 2);

    const state = LayoutManager.getState();
    const jsonStr = JSON.stringify(state.blocks);
    const restoredBlocks = JSON.parse(jsonStr);

    assert(restoredBlocks.length === 3, '主编辑区共 3 个顶层组件');
    assert(restoredBlocks[0].type === 'heading', '顶层第1个是 heading');
    assert(restoredBlocks[1].type === 'columns', '顶层第2个是 columns');
    assert(restoredBlocks[2].type === 'divider', '顶层第3个是 divider');

    const restoredCols = restoredBlocks[1].data.children;
    assert(restoredCols.length === 2, '多栏有 2 栏');

    assert(restoredCols[0].blocks.length === 2, '第1栏有 2 个组件');
    assert(restoredCols[0].blocks[0].data.text === '左栏标题', '第1栏标题文字正确');
    assert(restoredCols[0].blocks[1].data.text === '立即购买', '第1栏按钮文字正确');

    assert(restoredCols[1].blocks.length === 2, '第2栏有 2 个组件');
    assert(restoredCols[1].blocks[0].type === 'image', '第2栏第1个是 image');
    assert(restoredCols[1].blocks[1].type === 'paragraph', '第2栏第2个是 paragraph');
})();

// ---------- Test 7: findBlockByIdRecursive 递归定位 ----------
console.log('\n7. 测试 findBlockByIdRecursive 递归定位:');
(function test7() {
    LayoutManager.init({ blocks: [], selectedId: null }, {
        onChange: function() {},
        onSelect: function() {}
    });

    const columnsBlock = ComponentLibrary.createBlock('columns');
    LayoutManager.addBlock(columnsBlock, 0);

    const colId = columnsBlock.data.children[1].id;
    const btn = ComponentLibrary.createBlock('button');
    LayoutManager.addBlockToColumn(columnsBlock.id, colId, btn);

    const info = LayoutManager.findBlockByIdRecursive(btn.id);

    assert(info !== null, '能通过栏内组件 ID 找到');
    assert(info.block.id === btn.id, '找到的 block id 正确');
    assert(info.parentBlockId === columnsBlock.id, '找到的父 columns block id 正确');
    assert(info.colId === colId, '找到的 colId 正确');

    const topInfo = LayoutManager.findBlockByIdRecursive(columnsBlock.id);
    assert(topInfo !== null, '找到顶层 columns block');
    assert(topInfo.parentBlockId === null, '顶层组件 parentBlockId 为 null');
    assert(topInfo.colId === null, '顶层组件 colId 为 null');
})();

// ---------- Test 8: updateAnyBlock / deleteAnyBlock / duplicateAnyBlock ----------
console.log('\n8. 测试通用方法 updateAnyBlock / deleteAnyBlock / duplicateAnyBlock:');
(function test8() {
    LayoutManager.init({ blocks: [], selectedId: null }, {
        onChange: function() {},
        onSelect: function() {}
    });

    const columnsBlock = ComponentLibrary.createBlock('columns');
    LayoutManager.addBlock(columnsBlock, 0);

    const colId = columnsBlock.data.children[0].id;
    const heading = ComponentLibrary.createBlock('heading');
    LayoutManager.addBlockToColumn(columnsBlock.id, colId, heading);

    // updateAnyBlock
    LayoutManager.updateAnyBlock(heading.id, { text: '已更新!', fontSize: 36 });
    let state = LayoutManager.getState();
    const updated = state.blocks[0].data.children[0].blocks[0];
    assert(updated.data.text === '已更新!', 'updateAnyBlock 更新文字正确');
    assert(updated.data.fontSize === 36, 'updateAnyBlock 更新字号正确');

    // duplicateAnyBlock
    LayoutManager.duplicateAnyBlock(heading.id);
    state = LayoutManager.getState();
    assert(state.blocks[0].data.children[0].blocks.length === 2, 'duplicateAnyBlock 复制成功');

    // deleteAnyBlock
    const ids = state.blocks[0].data.children[0].blocks.map(b => b.id);
    LayoutManager.deleteAnyBlock(ids[0]);
    state = LayoutManager.getState();
    assert(state.blocks[0].data.children[0].blocks.length === 1, 'deleteAnyBlock 删除成功');
    assert(state.blocks[0].data.children[0].blocks[0].id === ids[1], '删除的是正确的组件');
})();

// ---------- Summary ----------
console.log('\n========================================');
console.log('测试结果: 通过 ' + passCount + ' / ' + (passCount + failCount));
if (failCount === 0) {
    console.log('🎉 所有测试通过!');
    process.exit(0);
} else {
    console.log('💥 有 ' + failCount + ' 个测试失败!');
    process.exit(1);
}
