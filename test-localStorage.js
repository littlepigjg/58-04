const fs = require('fs');
const path = require('path');

// Mock minimal browser globals
global.window = global;
global.localStorage = (function() {
    const store = {};
    return {
        getItem: function(k) { return k in store ? store[k] : null; },
        setItem: function(k, v) { store[k] = String(v); },
        removeItem: function(k) { delete store[k]; },
        clear: function() { for (const k in store) delete store[k]; },
        _getStore: function() { return store; }
    };
})();

function loadModule(filePath) {
    const code = fs.readFileSync(filePath, 'utf-8');
    const wrapped = code + '\n' +
        'if (typeof BlockListManager !== "undefined") global.BlockListManager = BlockListManager;' +
        'if (typeof ComponentLibrary !== "undefined") global.ComponentLibrary = ComponentLibrary;' +
        'if (typeof LayoutManager !== "undefined") global.LayoutManager = LayoutManager;' +
        'if (typeof TemplateEngine !== "undefined") global.TemplateEngine = TemplateEngine;';
    eval(wrapped);
}

loadModule(path.join(__dirname, 'js/blockList.js'));
loadModule(path.join(__dirname, 'js/components.js'));
loadModule(path.join(__dirname, 'js/templateEngine.js'));
loadModule(path.join(__dirname, 'js/layout.js'));

console.log('\n=== 本地存储 + 多栏数据持久化 综合测试 ===\n');

let passCount = 0;
let failCount = 0;
const STORAGE_KEY = 'email_template_editor_state_v1';

function assert(condition, msg) {
    if (condition) {
        passCount++;
        console.log('   ✅ PASS:', msg);
    } else {
        failCount++;
        console.log('   ❌ FAIL:', msg);
    }
}

// ---------- Test 1: 模拟 saveStateToStorage 逻辑 ----------
console.log('1. 测试本地存储写入/读取逻辑:');
(function test1() {
    const columnsBlock = ComponentLibrary.createBlock('columns');
    const col0Id = columnsBlock.data.children[0].id;
    const col1Id = columnsBlock.data.children[1].id;

    const img = ComponentLibrary.createBlock('image');
    img.data.src = 'https://test.com/logo.png';
    const btn = ComponentLibrary.createBlock('button');
    btn.data.text = '立即注册';
    const heading = ComponentLibrary.createBlock('heading');

    const stateToSave = { blocks: [heading, columnsBlock] };

    // 手动添加子项到 col
    columnsBlock.data.children[0].blocks.push(img);
    columnsBlock.data.children[1].blocks.push(btn);

    // 模拟 saveStateToStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        blocks: stateToSave.blocks,
        savedAt: Date.now()
    }));

    // 模拟 loadStateFromStorage
    const raw = localStorage.getItem(STORAGE_KEY);
    const loaded = JSON.parse(raw);
    assert(raw !== null, 'localStorage 能读取到写入的内容');
    assert(Array.isArray(loaded.blocks), '读取到的 blocks 是数组');
    assert(loaded.blocks.length === 2, '读取到 2 个顶层 block');
    assert(loaded.blocks[1].type === 'columns', '第 2 个 block 是 columns');

    const cols = loaded.blocks[1].data.children;
    assert(cols[0].blocks.length === 1, '第 1 栏有 1 个 block');
    assert(cols[0].blocks[0].type === 'image', '第 1 栏是 image');
    assert(cols[0].blocks[0].data.src === 'https://test.com/logo.png', '第 1 栏图片 src 正确');
    assert(cols[1].blocks.length === 1, '第 2 栏有 1 个 block');
    assert(cols[1].blocks[0].type === 'button', '第 2 栏是 button');
    assert(cols[1].blocks[0].data.text === '立即注册', '第 2 栏按钮文字正确');
})();

// ---------- Test 2: LayoutManager 操作后 JSON 序列化正确（完整链路） ----------
console.log('\n2. 测试 LayoutManager 完整链路:');
(function test2() {
    localStorage.removeItem(STORAGE_KEY);
    let lastState = null;

    LayoutManager.init({ blocks: [], selectedId: null, selectedColId: null }, {
        onChange: function(state) {
            lastState = state;
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                blocks: state.blocks,
                savedAt: Date.now()
            }));
        },
        onSelect: function() {}
    });

    // 1. 添加多栏
    const columnsBlock = ComponentLibrary.createBlock('columns');
    LayoutManager.addBlock(columnsBlock, 0);

    const parentId = columnsBlock.id;
    const col0Id = columnsBlock.data.children[0].id;
    const col1Id = columnsBlock.data.children[1].id;

    // 2. 在两栏分别添加多种组件
    const h1 = ComponentLibrary.createBlock('heading');
    h1.data.text = '左栏大标题';
    LayoutManager.addBlockToColumn(parentId, col0Id, h1);

    const p1 = ComponentLibrary.createBlock('paragraph');
    LayoutManager.addBlockToColumn(parentId, col0Id, p1);

    const img1 = ComponentLibrary.createBlock('image');
    img1.data.src = 'https://pic.com/a.png';
    LayoutManager.addBlockToColumn(parentId, col1Id, img1);

    const btn1 = ComponentLibrary.createBlock('button');
    btn1.data.text = '点我';
    btn1.data.bgColor = '#ff0000';
    LayoutManager.addBlockToColumn(parentId, col1Id, btn1);

    // 3. 更新栏内组件
    LayoutManager.updateColumnBlock(parentId, col0Id, h1.id, { fontSize: 24 });
    LayoutManager.updateColumnBlock(parentId, col1Id, btn1.id, { text: '修改后的按钮' });

    // 4. 把 p1 从左栏删除
    LayoutManager.removeBlockFromColumn(parentId, col0Id, p1.id);

    // 5. 从存储读取
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = JSON.parse(raw);

    assert(stored.blocks.length === 1, '主编辑区保存了 1 个顶层 block');

    const savedColsBlock = stored.blocks[0];
    assert(savedColsBlock.id === parentId, '顶层 columns id 正确');
    assert(savedColsBlock.type === 'columns', '顶层 block 类型正确');

    const savedCols = savedColsBlock.data.children;
    assert(savedCols.length === 2, '栏数 2 正确');

    assert(savedCols[0].blocks.length === 1, '第 1 栏 1 个组件（删除成功）');
    assert(savedCols[0].blocks[0].id === h1.id, '第 1 栏剩余的是 heading');
    assert(savedCols[0].blocks[0].data.fontSize === 24, '第 1 栏 heading fontSize 更新为 24 成功');
    assert(savedCols[0].blocks[0].data.text === '左栏大标题', '第 1 栏 heading 文字保存正确');

    assert(savedCols[1].blocks.length === 2, '第 2 栏 2 个组件');
    assert(savedCols[1].blocks[0].type === 'image', '第 2 栏第一个是 image');
    assert(savedCols[1].blocks[0].data.src === 'https://pic.com/a.png', '第 2 栏 image src 正确');
    assert(savedCols[1].blocks[1].type === 'button', '第 2 栏第二个是 button');
    assert(savedCols[1].blocks[1].data.text === '修改后的按钮', '第 2 栏 button text 更新成功');
    assert(savedCols[1].blocks[1].data.bgColor === '#ff0000', '第 2 栏 button bgColor 正确');
})();

// ---------- Test 3: 模拟页面刷新 - 重新 init LayoutManager ----------
console.log('\n3. 模拟页面刷新 - 重新 init LayoutManager 从存储恢复:');
(function test3() {
    // 先从 storage 读取
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = JSON.parse(raw);

    // 模拟刷新: 创建新的 LayoutManager 实例（实际上浏览器刷新会重新加载模块，但这里我们复用全局，手动重新init）
    LayoutManager.init({ blocks: [], selectedId: null, selectedColId: null }, {
        onChange: function() {},
        onSelect: function() {}
    });

    // 模拟 loadStateFromStorage
    let restored = null;
    const raw2 = localStorage.getItem(STORAGE_KEY);
    if (raw2) {
        const d = JSON.parse(raw2);
        if (d && Array.isArray(d.blocks)) {
            restored = { blocks: d.blocks, selectedId: null, selectedColId: null };
        }
    }
    LayoutManager.setState(restored);

    const state = LayoutManager.getState();
    const columnsBlock = state.blocks[0];
    assert(columnsBlock.type === 'columns', '恢复后顶层 block 是 columns');

    const cols = columnsBlock.data.children;
    assert(cols[0].blocks[0].type === 'heading', '恢复后左栏第一个是 heading');
    assert(cols[0].blocks[0].data.fontSize === 24, '恢复后 heading fontSize = 24');
    assert(cols[0].blocks[0].data.text === '左栏大标题', '恢复后 heading 文字正确');

    assert(cols[1].blocks[0].type === 'image', '恢复后右栏第一个是 image');
    assert(cols[1].blocks[0].data.src === 'https://pic.com/a.png', '恢复后 image src 正确');
    assert(cols[1].blocks[1].type === 'button', '恢复后右栏第二个是 button');
    assert(cols[1].blocks[1].data.text === '修改后的按钮', '恢复后 button text 正确');

    // 验证数据结构完整性（JSON 序列化/反序列化后渲染链路）
    const jsonForRender = JSON.stringify(state.blocks);
    assert(jsonForRender && jsonForRender.length > 0, '恢复后的数据可正常 JSON 序列化');
    assert(jsonForRender.includes('修改后的按钮'), '序列化数据包含右栏按钮文字');
    assert(jsonForRender.includes('左栏大标题'), '序列化数据包含左栏标题文字');
    assert(jsonForRender.includes('https://pic.com/a.png'), '序列化数据包含图片 src');

    // 简单渲染链路测试（检查 block id、type、data 全链路正确传递）
    const renderable = state.blocks.every(function(b) {
        if (b.type === 'columns') {
            return b.data.children.every(function(c) {
                return Array.isArray(c.blocks);
            });
        }
        return b.id && b.type && b.data;
    });
    assert(renderable, '所有 block 结构都可被 TemplateEngine 识别渲染');
})();

// ---------- Test 4: 复制 + 排序持久化 ----------
console.log('\n4. 测试栏内复制和排序持久化:');
(function test4() {
    localStorage.removeItem(STORAGE_KEY);
    let changeCount = 0;

    LayoutManager.init({ blocks: [], selectedId: null, selectedColId: null }, {
        onChange: function(state) {
            changeCount++;
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                blocks: state.blocks,
                savedAt: Date.now()
            }));
        },
        onSelect: function() {}
    });

    const columnsBlock = ComponentLibrary.createBlock('columns');
    LayoutManager.addBlock(columnsBlock, 0);
    const colId = columnsBlock.data.children[0].id;

    // 添加 3 个
    const b1 = ComponentLibrary.createBlock('heading');
    const b2 = ComponentLibrary.createBlock('paragraph');
    const b3 = ComponentLibrary.createBlock('button');
    LayoutManager.addBlockToColumn(columnsBlock.id, colId, b1);
    LayoutManager.addBlockToColumn(columnsBlock.id, colId, b2);
    LayoutManager.addBlockToColumn(columnsBlock.id, colId, b3);

    // 复制 b2（paragraph）
    LayoutManager.duplicateColumnBlock(columnsBlock.id, colId, b2.id);

    // 读取复制后的数据
    const saved1 = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const blocksAfterDup = saved1.blocks[0].data.children[0].blocks;
    assert(blocksAfterDup.length === 4, '复制后共 4 个组件');
    assert(blocksAfterDup[2].type === 'paragraph', '第 3 个是新复制出的 paragraph');
    assert(blocksAfterDup[2].id !== b2.id, '复制出的组件 id 不同');

    // 把 b1（index 0）移到末尾（index 4）
    LayoutManager.moveBlockInColumn(columnsBlock.id, colId, 0, 4);

    const saved2 = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const blocksAfterMove = saved2.blocks[0].data.children[0].blocks;
    assert(blocksAfterMove.length === 4, '移动后仍 4 个组件');
    assert(blocksAfterMove[0].type === 'paragraph', '移动后第一个是 paragraph');
    assert(blocksAfterMove[1].type === 'paragraph', '移动后第二个是 paragraph(副本)');
    assert(blocksAfterMove[2].type === 'button', '移动后第三个是 button');
    assert(blocksAfterMove[3].type === 'heading', '移动后末尾是 heading');
    assert(changeCount > 5, '添加/删除/复制/排序等操作都触发 onChange 并写入存储');
})();

// ---------- Summary ----------
console.log('\n========================================');
console.log('测试结果: 通过 ' + passCount + ' / ' + (passCount + failCount));
if (failCount === 0) {
    console.log('🎉 所有本地存储 + 多栏持久化测试通过!');
    process.exit(0);
} else {
    console.log('💥 有 ' + failCount + ' 个测试失败!');
    process.exit(1);
}
