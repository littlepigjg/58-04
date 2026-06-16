const TemplateLibrary = (() => {

    const METADATA_KEY = 'email_template_library_metadata_v1';
    const CONTENT_KEY_PREFIX = 'email_template_library_content_v1_';
    const CATEGORIES = ['预设模板', '营销推广', '通知确认', '活动邀请', '账户安全', '自定义'];
    const PRESET_CATEGORY = '预设模板';

    function generateId() {
        return 'tpl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    function loadMetadata() {
        try {
            const raw = localStorage.getItem(METADATA_KEY);
            if (!raw) return [];
            const data = JSON.parse(raw);
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.warn('加载模板元数据失败:', e);
            return [];
        }
    }

    function saveMetadata(metadata) {
        try {
            localStorage.setItem(METADATA_KEY, JSON.stringify(metadata));
            return true;
        } catch (e) {
            console.warn('保存模板元数据失败:', e);
            return false;
        }
    }

    function loadContent(templateId) {
        try {
            const raw = localStorage.getItem(CONTENT_KEY_PREFIX + templateId);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            console.warn('加载模板内容失败:', e);
            return null;
        }
    }

    function saveContent(templateId, blocks) {
        try {
            localStorage.setItem(CONTENT_KEY_PREFIX + templateId, JSON.stringify(blocks));
            return true;
        } catch (e) {
            console.warn('保存模板内容失败:', e);
            return false;
        }
    }

    function deleteContent(templateId) {
        localStorage.removeItem(CONTENT_KEY_PREFIX + templateId);
    }

    const BLOCK_SCHEMA = {
        heading: ['text', 'level', 'fontSize', 'color', 'align', 'fontWeight', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'],
        paragraph: ['text', 'fontSize', 'lineHeight', 'color', 'align', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'],
        image: ['src', 'alt', 'href', 'width', 'align', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'],
        button: ['text', 'href', 'backgroundColor', 'color', 'fontSize', 'fontWeight', 'borderRadius', 'paddingHorizontal', 'paddingVertical', 'align', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'],
        divider: ['style', 'color', 'thickness', 'width', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'],
        columns: ['columns', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'children']
    };

    function validateBlock(block) {
        if (!block || typeof block !== 'object') return false;
        if (typeof block.id !== 'string' || !block.id) return false;
        if (typeof block.type !== 'string' || !BLOCK_SCHEMA[block.type]) return false;
        if (!block.data || typeof block.data !== 'object') return false;

        if (block.type === 'columns') {
            if (!Array.isArray(block.data.children)) return false;
            for (const col of block.data.children) {
                if (!col || typeof col !== 'object') return false;
                if (typeof col.id !== 'string') return false;
                if (col.blocks && !Array.isArray(col.blocks)) return false;
                if (col.blocks) {
                    for (const childBlock of col.blocks) {
                        if (!validateBlock(childBlock)) return false;
                    }
                }
            }
        }

        return true;
    }

    function validateBlocks(blocks) {
        if (!Array.isArray(blocks)) return false;
        for (const block of blocks) {
            if (!validateBlock(block)) return false;
        }
        return true;
    }

    function validateTemplateMetadata(meta) {
        if (!meta || typeof meta !== 'object') return false;
        if (typeof meta.id !== 'string' || !meta.id) return false;
        if (typeof meta.name !== 'string' || !meta.name) return false;
        if (typeof meta.category !== 'string') return false;
        if (!Array.isArray(meta.tags)) return false;
        if (typeof meta.createdAt !== 'number') return false;
        if (typeof meta.useCount !== 'number') return false;
        if (typeof meta.isPreset !== 'boolean') return false;
        return true;
    }

    function getAllTemplates() {
        const metadata = loadMetadata();
        ensurePresetTemplates();
        return loadMetadata().filter(validateTemplateMetadata);
    }

    function getTemplateById(id) {
        const metadata = loadMetadata().find(m => m.id === id);
        if (!metadata) return null;
        const blocks = loadContent(id);
        if (!blocks) return null;
        return { metadata, blocks };
    }

    function getTemplateBlocks(id) {
        const tpl = getTemplateById(id);
        return tpl ? tpl.blocks : null;
    }

    function createTemplate({ name, category, tags, blocks, thumbnail }) {
        if (!validateBlocks(blocks)) {
            throw new Error('模板数据格式无效');
        }
        if (!name || !name.trim()) {
            throw new Error('模板名称不能为空');
        }

        const id = generateId();
        const metadata = {
            id,
            name: name.trim(),
            category: category || '自定义',
            tags: Array.isArray(tags) ? tags.filter(t => t && t.trim()) : [],
            thumbnail: thumbnail || '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            useCount: 0,
            isPreset: false
        };

        const allMeta = loadMetadata();
        allMeta.push(metadata);
        saveMetadata(allMeta);
        saveContent(id, blocks);

        return { metadata, blocks };
    }

    function updateTemplate(id, updates) {
        const allMeta = loadMetadata();
        const idx = allMeta.findIndex(m => m.id === id);
        if (idx === -1) return null;

        const meta = allMeta[idx];
        if (meta.isPreset) {
            throw new Error('预设模板不能修改');
        }

        if (updates.name !== undefined) {
            if (!updates.name || !updates.name.trim()) {
                throw new Error('模板名称不能为空');
            }
            meta.name = updates.name.trim();
        }
        if (updates.category !== undefined) meta.category = updates.category;
        if (updates.tags !== undefined) {
            meta.tags = Array.isArray(updates.tags) ? updates.tags.filter(t => t && t.trim()) : [];
        }
        if (updates.thumbnail !== undefined) meta.thumbnail = updates.thumbnail;
        meta.updatedAt = Date.now();

        if (updates.blocks !== undefined) {
            if (!validateBlocks(updates.blocks)) {
                throw new Error('模板数据格式无效');
            }
            saveContent(id, updates.blocks);
        }

        allMeta[idx] = meta;
        saveMetadata(allMeta);
        return meta;
    }

    function deleteTemplate(id) {
        const allMeta = loadMetadata();
        const idx = allMeta.findIndex(m => m.id === id);
        if (idx === -1) return false;

        if (allMeta[idx].isPreset) {
            throw new Error('预设模板不能删除');
        }

        allMeta.splice(idx, 1);
        saveMetadata(allMeta);
        deleteContent(id);
        return true;
    }

    function renameTemplate(id, newName) {
        return updateTemplate(id, { name: newName });
    }

    function incrementUseCount(id) {
        const allMeta = loadMetadata();
        const idx = allMeta.findIndex(m => m.id === id);
        if (idx === -1) return;
        allMeta[idx].useCount = (allMeta[idx].useCount || 0) + 1;
        allMeta[idx].lastUsedAt = Date.now();
        saveMetadata(allMeta);
    }

    function searchTemplates({ keyword, category } = {}) {
        let templates = getAllTemplates();

        if (category && category !== '全部') {
            templates = templates.filter(t => t.category === category);
        }

        if (keyword && keyword.trim()) {
            const kw = keyword.trim().toLowerCase();
            templates = templates.filter(t =>
                t.name.toLowerCase().includes(kw) ||
                (t.tags && t.tags.some(tag => tag.toLowerCase().includes(kw)))
            );
        }

        return templates.sort((a, b) => {
            if (a.isPreset !== b.isPreset) return a.isPreset ? -1 : 1;
            return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
        });
    }

    function exportTemplate(id) {
        const tpl = getTemplateById(id);
        if (!tpl) return null;
        return JSON.stringify({
            metadata: {
                name: tpl.metadata.name,
                category: tpl.metadata.category,
                tags: tpl.metadata.tags
            },
            blocks: tpl.blocks
        }, null, 2);
    }

    function importTemplate(jsonStr) {
        try {
            const data = JSON.parse(jsonStr);
            if (!data || !data.blocks || !data.metadata) {
                throw new Error('模板文件格式无效');
            }
            if (!validateBlocks(data.blocks)) {
                throw new Error('模板数据格式损坏');
            }
            return createTemplate({
                name: data.metadata.name || '导入的模板',
                category: data.metadata.category || '自定义',
                tags: data.metadata.tags || [],
                blocks: data.blocks
            });
        } catch (e) {
            if (e instanceof SyntaxError) {
                throw new Error('JSON 格式解析失败');
            }
            throw e;
        }
    }

    function createPresetBlock(type, overrides = {}) {
        const defaults = JSON.parse(JSON.stringify(ComponentLibrary.getComponent(type).defaults));
        const block = {
            id: 'preset_' + type + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            type: type,
            data: { ...defaults, ...overrides }
        };
        if (type === 'columns') {
            block.data.children = [];
            for (let i = 0; i < block.data.columns; i++) {
                block.data.children.push({
                    id: 'preset_col_' + i + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                    blocks: []
                });
            }
        }
        return block;
    }

    function buildPresetTemplates() {
        return [
            {
                name: '新用户欢迎邮件',
                category: PRESET_CATEGORY,
                tags: ['欢迎', '新用户', '注册'],
                buildBlocks: () => {
                    const blocks = [];
                    blocks.push(createPresetBlock('image', {
                        src: 'https://picsum.photos/seed/welcome/600/200',
                        alt: '欢迎加入'
                    }));
                    blocks.push(createPresetBlock('heading', {
                        text: '欢迎加入我们！🎉',
                        level: 1,
                        color: '#667eea'
                    }));
                    blocks.push(createPresetBlock('paragraph', {
                        text: '亲爱的用户，\n\n感谢您注册成为我们的会员！我们非常高兴能与您开启这段旅程。',
                        align: 'left'
                    }));
                    blocks.push(createPresetBlock('paragraph', {
                        text: '作为新用户，您将享受以下专属福利：\n• 新人专属优惠券\n• 首次购物免运费\n• 会员专享折扣',
                        align: 'left',
                        fontSize: 14
                    }));
                    blocks.push(createPresetBlock('button', {
                        text: '立即开始探索',
                        href: 'https://example.com',
                        backgroundColor: '#667eea',
                        paddingVertical: 14,
                        paddingHorizontal: 32
                    }));
                    blocks.push(createPresetBlock('divider', {}));
                    blocks.push(createPresetBlock('paragraph', {
                        text: '如有任何问题，请随时联系我们的客服团队。\n\n祝您购物愉快！',
                        align: 'left',
                        color: '#6b7280',
                        fontSize: 13
                    }));
                    return blocks;
                }
            },
            {
                name: '电商促销通知',
                category: PRESET_CATEGORY,
                tags: ['促销', '折扣', '营销'],
                buildBlocks: () => {
                    const blocks = [];
                    blocks.push(createPresetBlock('heading', {
                        text: '🔥 限时大促销！',
                        level: 1,
                        color: '#ef4444',
                        fontSize: 32
                    }));
                    blocks.push(createPresetBlock('image', {
                        src: 'https://picsum.photos/seed/sale/600/250',
                        alt: '促销活动'
                    }));
                    blocks.push(createPresetBlock('heading', {
                        text: '全场低至5折起',
                        level: 2,
                        color: '#f59e0b',
                        fontSize: 24
                    }));
                    blocks.push(createPresetBlock('paragraph', {
                        text: '活动时间仅限本周！错过再等一年！\n精选商品超值优惠，赶紧来抢购吧！',
                        align: 'center'
                    }));
                    const cols = createPresetBlock('columns', { columns: 2 });
                    cols.data.children[0].blocks.push(createPresetBlock('heading', {
                        text: '新用户专享',
                        level: 3,
                        fontSize: 18,
                        color: '#667eea'
                    }));
                    cols.data.children[0].blocks.push(createPresetBlock('paragraph', {
                        text: '首单立减50元\n满200即可使用',
                        align: 'center',
                        fontSize: 13
                    }));
                    cols.data.children[1].blocks.push(createPresetBlock('heading', {
                        text: '老用户回馈',
                        level: 3,
                        fontSize: 18,
                        color: '#10b981'
                    }));
                    cols.data.children[1].blocks.push(createPresetBlock('paragraph', {
                        text: '满500减100\n再送精美礼品',
                        align: 'center',
                        fontSize: 13
                    }));
                    blocks.push(cols);
                    blocks.push(createPresetBlock('button', {
                        text: '马上去抢购 →',
                        href: 'https://example.com/sale',
                        backgroundColor: '#ef4444',
                        fontSize: 16,
                        paddingVertical: 16,
                        paddingHorizontal: 40
                    }));
                    blocks.push(createPresetBlock('divider', {}));
                    blocks.push(createPresetBlock('paragraph', {
                        text: '活动最终解释权归本公司所有',
                        align: 'center',
                        color: '#9ca3af',
                        fontSize: 11
                    }));
                    return blocks;
                }
            },
            {
                name: '订单确认回执',
                category: PRESET_CATEGORY,
                tags: ['订单', '确认', '回执'],
                buildBlocks: () => {
                    const blocks = [];
                    blocks.push(createPresetBlock('heading', {
                        text: '📦 订单确认',
                        level: 1,
                        color: '#10b981'
                    }));
                    blocks.push(createPresetBlock('paragraph', {
                        text: '亲爱的顾客，\n\n感谢您的购买！您的订单已成功提交，以下是订单详情：',
                        align: 'left'
                    }));
                    blocks.push(createPresetBlock('divider', {}));
                    blocks.push(createPresetBlock('heading', {
                        text: '订单信息',
                        level: 3,
                        fontSize: 18,
                        align: 'left'
                    }));
                    blocks.push(createPresetBlock('paragraph', {
                        text: '订单号：#20240101-12345\n下单时间：2024年1月1日 14:30\n支付方式：支付宝\n订单状态：已支付',
                        align: 'left',
                        fontSize: 13,
                        lineHeight: 2
                    }));
                    blocks.push(createPresetBlock('divider', {}));
                    blocks.push(createPresetBlock('heading', {
                        text: '收货信息',
                        level: 3,
                        fontSize: 18,
                        align: 'left'
                    }));
                    blocks.push(createPresetBlock('paragraph', {
                        text: '收货人：张三\n联系电话：138****8888\n收货地址：北京市朝阳区某某街道某某小区1号楼101室',
                        align: 'left',
                        fontSize: 13,
                        lineHeight: 2
                    }));
                    blocks.push(createPresetBlock('divider', {}));
                    blocks.push(createPresetBlock('heading', {
                        text: '订单金额',
                        level: 3,
                        fontSize: 18,
                        align: 'right',
                        color: '#ef4444'
                    }));
                    blocks.push(createPresetBlock('paragraph', {
                        text: '商品总额：¥599.00\n运费：¥0.00\n优惠：-¥100.00\n————————\n实付金额：¥499.00',
                        align: 'right',
                        fontSize: 14,
                        lineHeight: 2,
                        fontWeight: 'bold'
                    }));
                    blocks.push(createPresetBlock('button', {
                        text: '查看订单详情',
                        href: 'https://example.com/orders/123',
                        backgroundColor: '#10b981'
                    }));
                    return blocks;
                }
            },
            {
                name: '活动邀请函',
                category: PRESET_CATEGORY,
                tags: ['邀请', '活动', '会议'],
                buildBlocks: () => {
                    const blocks = [];
                    blocks.push(createPresetBlock('image', {
                        src: 'https://picsum.photos/seed/invite/600/180',
                        alt: '活动邀请'
                    }));
                    blocks.push(createPresetBlock('heading', {
                        text: '诚邀您参加',
                        level: 2,
                        color: '#764ba2',
                        fontSize: 22
                    }));
                    blocks.push(createPresetBlock('heading', {
                        text: '2024 年度产品发布会',
                        level: 1,
                        color: '#667eea',
                        fontSize: 30
                    }));
                    blocks.push(createPresetBlock('divider', { color: '#667eea', thickness: 2 }));
                    const cols = createPresetBlock('columns', { columns: 2 });
                    cols.data.children[0].blocks.push(createPresetBlock('heading', {
                        text: '📅 时间',
                        level: 3,
                        fontSize: 16,
                        align: 'left',
                        color: '#667eea'
                    }));
                    cols.data.children[0].blocks.push(createPresetBlock('paragraph', {
                        text: '2024年3月15日\n星期五 下午2:00',
                        align: 'left',
                        fontSize: 14
                    }));
                    cols.data.children[1].blocks.push(createPresetBlock('heading', {
                        text: '📍 地点',
                        level: 3,
                        fontSize: 16,
                        align: 'left',
                        color: '#667eea'
                    }));
                    cols.data.children[1].blocks.push(createPresetBlock('paragraph', {
                        text: '北京国际会议中心\n3楼大会堂A厅',
                        align: 'left',
                        fontSize: 14
                    }));
                    blocks.push(cols);
                    blocks.push(createPresetBlock('divider', {}));
                    blocks.push(createPresetBlock('heading', {
                        text: '活动亮点',
                        level: 3,
                        fontSize: 18,
                        align: 'left'
                    }));
                    blocks.push(createPresetBlock('paragraph', {
                        text: '• 全新产品线发布\n• 行业大咖主题演讲\n• 现场抽奖，奖品丰厚\n• 精美茶歇与交流环节',
                        align: 'left',
                        fontSize: 14,
                        lineHeight: 2
                    }));
                    blocks.push(createPresetBlock('button', {
                        text: '立即报名参加',
                        href: 'https://example.com/rsvp',
                        backgroundColor: '#764ba2',
                        paddingVertical: 14,
                        paddingHorizontal: 36
                    }));
                    blocks.push(createPresetBlock('paragraph', {
                        text: '期待与您相见！',
                        align: 'center',
                        color: '#6b7280',
                        fontSize: 13
                    }));
                    return blocks;
                }
            },
            {
                name: '密码重置提醒',
                category: PRESET_CATEGORY,
                tags: ['密码', '重置', '安全'],
                buildBlocks: () => {
                    const blocks = [];
                    blocks.push(createPresetBlock('heading', {
                        text: '🔐 密码重置请求',
                        level: 1,
                        color: '#f59e0b'
                    }));
                    blocks.push(createPresetBlock('paragraph', {
                        text: '您好，\n\n我们收到了您的密码重置请求。请点击下方按钮重置您的密码：',
                        align: 'left'
                    }));
                    blocks.push(createPresetBlock('button', {
                        text: '重置密码',
                        href: 'https://example.com/reset-password?token=xxx',
                        backgroundColor: '#f59e0b',
                        color: '#1f2937',
                        paddingVertical: 14,
                        paddingHorizontal: 36
                    }));
                    blocks.push(createPresetBlock('divider', {}));
                    blocks.push(createPresetBlock('heading', {
                        text: '⚠️ 安全提示',
                        level: 3,
                        fontSize: 16,
                        align: 'left',
                        color: '#ef4444'
                    }));
                    blocks.push(createPresetBlock('paragraph', {
                        text: '• 此链接有效期为30分钟，过期后请重新申请\n• 请勿将此链接透露给任何人\n• 如果您没有发起此请求，请忽略此邮件并检查账户安全\n• 建议您使用强密码并定期更换',
                        align: 'left',
                        fontSize: 13,
                        lineHeight: 2,
                        color: '#4b5563'
                    }));
                    blocks.push(createPresetBlock('divider', {}));
                    blocks.push(createPresetBlock('paragraph', {
                        text: '如果按钮无法点击，请复制以下链接到浏览器中打开：',
                        align: 'left',
                        fontSize: 13,
                        color: '#6b7280'
                    }));
                    blocks.push(createPresetBlock('paragraph', {
                        text: 'https://example.com/reset-password?token=xxx',
                        align: 'left',
                        fontSize: 12,
                        color: '#667eea',
                        paddingLeft: 24,
                        paddingRight: 24
                    }));
                    blocks.push(createPresetBlock('divider', {}));
                    blocks.push(createPresetBlock('paragraph', {
                        text: '此邮件为系统自动发送，请勿直接回复。\n如有疑问，请联系客服：support@example.com',
                        align: 'center',
                        fontSize: 12,
                        color: '#9ca3af'
                    }));
                    return blocks;
                }
            }
        ];
    }

    function ensurePresetTemplates() {
        const metadata = loadMetadata();
        const presetDefs = buildPresetTemplates();
        let changed = false;

        for (const def of presetDefs) {
            const existing = metadata.find(m => m.isPreset && m.name === def.name);
            if (!existing) {
                const id = 'preset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                const blocks = def.buildBlocks();
                const meta = {
                    id,
                    name: def.name,
                    category: def.category,
                    tags: def.tags,
                    thumbnail: '',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    useCount: 0,
                    isPreset: true
                };
                metadata.push(meta);
                saveContent(id, blocks);
                changed = true;
            }
        }

        if (changed) {
            saveMetadata(metadata);
        }
    }

    function generateThumbnail(blocks) {
        return new Promise((resolve) => {
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.left = '-9999px';
            iframe.style.top = '-9999px';
            iframe.style.width = '300px';
            iframe.style.height = '400px';
            iframe.style.border = 'none';
            iframe.style.opacity = '0';
            iframe.style.pointerEvents = 'none';
            document.body.appendChild(iframe);

            const doc = iframe.contentDocument || iframe.contentWindow.document;
            const fullHtml = TemplateEngine.renderFullHtml(blocks);
            doc.open();
            doc.write(fullHtml);
            doc.close();

            const timeoutId = setTimeout(() => {
                cleanup();
                resolve(generateFallbackThumbnail(blocks));
            }, 5000);

            function cleanup() {
                clearTimeout(timeoutId);
                if (iframe.parentNode) {
                    document.body.removeChild(iframe);
                }
            }

            iframe.onload = () => {
                setTimeout(() => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = 300;
                        canvas.height = 400;
                        const ctx = canvas.getContext('2d');

                        ctx.fillStyle = '#f3f4f6';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);

                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                        const body = iframeDoc.body;

                        if (!body) {
                            cleanup();
                            resolve(generateFallbackThumbnail(blocks));
                            return;
                        }

                        const textBlocks = [];
                        function extractText(element) {
                            if (element.nodeType === 3) {
                                const text = element.textContent.trim();
                                if (text) textBlocks.push(text);
                            } else if (element.children) {
                                for (const child of element.children) {
                                    extractText(child);
                                }
                            }
                        }
                        extractText(body);

                        let y = 30;
                        ctx.fillStyle = '#667eea';
                        ctx.fillRect(0, 0, canvas.width, 4);

                        if (textBlocks.length > 0) {
                            ctx.fillStyle = '#1f2937';
                            ctx.font = 'bold 16px sans-serif';
                            const title = textBlocks[0].substring(0, 20);
                            ctx.fillText(title, 20, y);
                            y += 28;
                        }

                        ctx.fillStyle = '#e5e7eb';
                        for (let i = 1; i < textBlocks.length && y < 380; i++) {
                            const text = textBlocks[i].substring(0, 35);
                            const lineHeight = Math.max(18, Math.min(24, 400 / Math.max(textBlocks.length, 8)));
                            ctx.fillStyle = i % 3 === 0 ? '#d1d5db' : '#e5e7eb';
                            ctx.fillRect(20, y, canvas.width - 40, lineHeight - 4);
                            y += lineHeight;
                        }

                        const imgElements = body.querySelectorAll('img');
                        if (imgElements.length > 0) {
                            ctx.fillStyle = '#93c5fd';
                            ctx.fillRect(20, 50, canvas.width - 40, 60);
                            ctx.fillStyle = '#667eea';
                            ctx.font = '12px sans-serif';
                            ctx.fillText('[图片]', 30, 85);
                        }

                        const btnElements = body.querySelectorAll('a');
                        if (btnElements.length > 0) {
                            const btnY = Math.min(y + 10, 340);
                            ctx.fillStyle = '#667eea';
                            const btnWidth = 120;
                            const btnX = (canvas.width - btnWidth) / 2;
                            roundRect(ctx, btnX, btnY, btnWidth, 32, 6, true);
                            ctx.fillStyle = '#ffffff';
                            ctx.font = '13px sans-serif';
                            ctx.textAlign = 'center';
                            ctx.fillText('按钮', canvas.width / 2, btnY + 21);
                            ctx.textAlign = 'left';
                        }

                        cleanup();
                        resolve(canvas.toDataURL('image/png'));
                    } catch (e) {
                        console.warn('缩略图生成失败，使用备用方案:', e);
                        cleanup();
                        resolve(generateFallbackThumbnail(blocks));
                    }
                }, 800);
            };
        });
    }

    function roundRect(ctx, x, y, w, h, r, fill) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        if (fill) ctx.fill();
    }

    function generateFallbackThumbnail(blocks) {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');

        const gradients = [
            ['#667eea', '#764ba2'],
            ['#f093fb', '#f5576c'],
            ['#4facfe', '#00f2fe'],
            ['#43e97b', '#38f9d7'],
            ['#fa709a', '#fee140'],
            ['#30cfd0', '#330867']
        ];
        const gradientIdx = blocks.length % gradients.length;
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, gradients[gradientIdx][0]);
        grad.addColorStop(1, gradients[gradientIdx][1]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        for (let i = 0; i < blocks.length; i++) {
            const y = 40 + i * 50;
            if (y < canvas.height - 40) {
                ctx.fillRect(20, y, canvas.width - 40, 30);
            }
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('邮件模板', canvas.width / 2, canvas.height / 2 - 10);
        ctx.font = '13px sans-serif';
        ctx.globalAlpha = 0.8;
        ctx.fillText(blocks.length + ' 个组件', canvas.width / 2, canvas.height / 2 + 18);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';

        return canvas.toDataURL('image/png');
    }

    function getCategories() {
        return CATEGORIES.slice();
    }

    function init() {
        ensurePresetTemplates();
    }

    return {
        init,
        getAllTemplates,
        getTemplateById,
        getTemplateBlocks,
        createTemplate,
        updateTemplate,
        deleteTemplate,
        renameTemplate,
        incrementUseCount,
        searchTemplates,
        exportTemplate,
        importTemplate,
        generateThumbnail,
        validateBlocks,
        getCategories,
        CATEGORIES
    };
})();
