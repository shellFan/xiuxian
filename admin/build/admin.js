import { AdminProviderError, LocalHttpAdminProvider } from './provider.js';
const ATTRIBUTE_KEYS = ['insight', 'constitution', 'perception', 'fortune', 'willpower'];
const ATTRIBUTE_LABELS = {
    insight: '悟性', constitution: '根骨', perception: '神识', fortune: '机缘', willpower: '心性',
};
const PROFESSION_IDS = ['JAVA_BACKEND', 'FRONTEND', 'QA', 'DEVOPS'];
const AVATAR_IDS = ['avatar-1', 'avatar-2', 'avatar-3', 'avatar-4'];
const NUMERIC_CHARACTER_FIELDS = new Set(['cultivationExp', 'careerLevel', 'mind', 'maxMind', 'performance', 'salary', 'spiritStones']);
const CHARACTER_LABELS = {
    characterName: '角色昵称', characterAvatarId: '角色头像', profession: '职业', characterBackground: '出身',
    destinyId: '天命', talentId: '天赋 ID', cultivationExp: '修为经验', careerLevel: '职场等级',
    mind: '当前心境', maxMind: '心境上限', performance: '绩效', salary: '薪俸', spiritStones: '灵石',
};
function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className)
        item.className = className;
    if (text !== undefined)
        item.textContent = text;
    return item;
}
function button(text, kind, onClick) {
    const item = node('button', `button ${kind}`, text);
    item.type = 'button';
    item.addEventListener('click', onClick);
    return item;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function asObject(value) { return value; }
function pathLabel(parts) { return parts.map((part) => /^\d+$/.test(part) ? `#${Number(part) + 1}` : part).join(' / '); }
class AdminApp {
    constructor(root, provider) {
        this.root = root;
        this.provider = provider;
        this.section = 'configs';
        this.configs = [];
        this.selectedConfigId = null;
        this.configDocument = null;
        this.configDraft = null;
        this.configInfo = null;
        this.character = null;
        this.creationConfig = null;
        this.professionNames = new Map();
        this.status = '';
        this.busy = false;
    }
    async mount() {
        try {
            this.configs = await this.provider.listConfigs();
            this.selectedConfigId = this.configs[0]?.id ?? null;
            await Promise.all([this.loadSelectedConfig(), this.loadCreationConfig()]);
            this.render();
        }
        catch (error) {
            this.renderError(error);
        }
    }
    async loadSelectedConfig() {
        if (!this.selectedConfigId)
            return;
        this.configInfo = this.configs.find((item) => item.id === this.selectedConfigId) ?? null;
        if (!this.configInfo)
            return;
        this.configDocument = await this.provider.readConfig(this.selectedConfigId);
        this.configDraft = clone(this.configDocument.value);
    }
    async loadCreationConfig() {
        const [creation, professions] = await Promise.all([
            this.provider.readConfig('character-creation'),
            this.provider.readConfig('professions'),
        ]);
        this.creationConfig = creation.value;
        const rows = professions.value?.professions;
        this.professionNames = new Map(Array.isArray(rows) ? rows.map((item) => [String(item.id), String(item.name)]) : []);
    }
    async loadCharacter() {
        this.character = await this.provider.readCurrentCharacter();
    }
    render() {
        this.root.replaceChildren();
        this.root.append(this.renderHeader());
        const workspace = node('div', 'workspace');
        workspace.append(this.renderSidebar());
        const main = node('main', 'main-column');
        if (this.section === 'configs')
            this.renderConfigs(main);
        else
            this.renderCharacter(main);
        workspace.append(main);
        this.root.append(workspace);
    }
    renderHeader() {
        const topbar = node('header', 'topbar');
        const brand = node('div', 'brand');
        brand.append(node('div', 'brand-mark', '牛'));
        const title = node('div');
        title.append(node('h1', undefined, '牛马修仙传 · 管理台'), node('p', undefined, '单人本地工作区 · 修改后可随时恢复'));
        brand.append(title);
        topbar.append(brand, node('span', 'source-pill', '● 本机文件 / 桌面存档'));
        return topbar;
    }
    renderSidebar() {
        const sidebar = node('aside', 'sidebar');
        sidebar.append(node('div', 'nav-label', 'WORKSPACE'));
        const config = button('◈  游戏配置', 'secondary', () => { this.section = 'configs'; this.status = ''; this.render(); });
        config.classList.add('nav-button');
        if (this.section === 'configs')
            config.classList.add('active');
        const character = button('♙  角色存档', 'secondary', async () => {
            this.section = 'character';
            this.status = '';
            this.render();
            if (!this.character) {
                try {
                    await this.loadCharacter();
                    this.render();
                }
                catch (error) {
                    this.status = this.errorMessage(error);
                    this.render();
                }
            }
        });
        character.classList.add('nav-button');
        if (this.section === 'character')
            character.classList.add('active');
        sidebar.append(config, character);
        return sidebar;
    }
    renderConfigs(main) {
        main.append(this.heading('游戏配置', 'EDITABLE SOURCE', '维护项目内的规范配置源文件。保存后需要重新构建并重启游戏才能生效。'));
        const listPanel = node('section', 'panel');
        listPanel.append(this.panelHeading('选择配置集', '只显示已登记、允许编辑的配置。所有结构、规则 ID 与玩法机制保持只读。'));
        const list = node('div', 'dataset-list');
        for (const config of this.configs) {
            const card = node('button', `dataset-card${config.id === this.selectedConfigId ? ' active' : ''}`);
            card.type = 'button';
            card.append(node('strong', undefined, config.title), node('span', undefined, config.description));
            card.addEventListener('click', async () => {
                this.selectedConfigId = config.id;
                this.status = '正在读取配置…';
                this.render();
                try {
                    await this.loadSelectedConfig();
                    this.status = '';
                    this.render();
                }
                catch (error) {
                    this.status = this.errorMessage(error);
                    this.render();
                }
            });
            list.append(card);
        }
        listPanel.append(list);
        main.append(listPanel);
        if (!this.configInfo || !this.configDocument || !this.configDraft) {
            const empty = node('div', 'empty-card');
            empty.append(node('h3', undefined, '无法读取配置'), node('p', undefined, this.status || '请刷新页面重试。'));
            main.append(empty);
            return;
        }
        const panel = node('section', 'panel');
        panel.append(this.panelHeading(this.configInfo.title, this.configInfo.description));
        const revision = node('div', 'revision', `修订 ${this.configDocument.revision}`);
        panel.append(revision);
        const form = node('form', 'field-grid');
        form.addEventListener('submit', (event) => event.preventDefault());
        this.renderConfigFields(form, this.configInfo.schema.fields, this.configDraft);
        panel.append(form);
        panel.append(this.notice('配置写入项目规范 JSON 源文件。桌面游戏生效步骤：npm run pc:build → npm run pc:copy → 重启游戏。若用打包版本，还需重新打包。'));
        panel.append(this.renderStatus());
        const actions = node('div', 'actions');
        actions.append(button('保存更改', 'primary', () => { void this.saveConfig(form); }));
        actions.append(button('撤销本页修改', 'secondary', () => { this.configDraft = clone(this.configDocument.value); this.status = '已撤销尚未保存的修改'; this.render(); }));
        actions.append(button('查看配置备份', 'secondary', () => { void this.toggleBackups(panel, 'config'); }));
        panel.append(actions);
        main.append(panel);
    }
    renderConfigFields(form, fields, value) {
        for (const schema of fields) {
            const parts = schema.pointer.split('/').slice(1);
            const leaves = [];
            this.collectLeaves(value, parts, [], leaves);
            for (const leaf of leaves) {
                const field = node('div', 'field');
                const label = node('label');
                label.append(node('span', undefined, schema.label));
                label.append(node('small', undefined, pathLabel(leaf.path)));
                field.append(label);
                const input = schema.valueType === 'string' && typeof leaf.value === 'string' && leaf.value.length > 100
                    ? node('textarea') : node('input');
                if (input instanceof HTMLInputElement) {
                    input.type = schema.valueType === 'integer' ? 'number' : schema.valueType === 'boolean' ? 'checkbox' : 'text';
                    if (schema.minimum !== undefined)
                        input.min = String(schema.minimum);
                    if (schema.maximum !== undefined)
                        input.max = String(schema.maximum);
                    if (schema.valueType === 'integer')
                        input.step = '1';
                    if (schema.required)
                        input.required = true;
                    if (schema.valueType === 'boolean')
                        input.checked = Boolean(leaf.value);
                    else
                        input.value = String(leaf.value ?? '');
                }
                else
                    input.value = String(leaf.value ?? '');
                input.dataset.configPath = JSON.stringify(leaf.path);
                input.addEventListener('input', () => this.readConfigDraft(form));
                field.append(input);
                form.append(field);
            }
        }
    }
    collectLeaves(value, pattern, actual, output) {
        if (pattern.length === 0) {
            output.push({ path: actual, value });
            return;
        }
        const [head, ...rest] = pattern;
        if (head === '*') {
            if (Array.isArray(value))
                value.forEach((child, index) => this.collectLeaves(child, rest, [...actual, String(index)], output));
            else if (value && typeof value === 'object')
                Object.entries(value).forEach(([key, child]) => this.collectLeaves(child, rest, [...actual, key], output));
            return;
        }
        if (value && typeof value === 'object' && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, head)) {
            this.collectLeaves(value[head], rest, [...actual, head], output);
        }
    }
    readConfigDraft(form) {
        if (!this.configDocument)
            return;
        const draft = clone(this.configDocument.value);
        for (const input of Array.from(form.querySelectorAll('[data-config-path]'))) {
            const parts = JSON.parse(input.dataset.configPath || '[]');
            const fieldSchema = this.configInfo?.schema.fields.find((item) => this.pathMatches(item.pointer, parts));
            let value = input instanceof HTMLInputElement && input.type === 'checkbox'
                ? input.checked
                : fieldSchema?.valueType === 'integer' ? Number(input.value) : input.value;
            if (fieldSchema?.valueType === 'integer' && input.value.trim() === '')
                value = null;
            this.setAtPath(draft, parts, value);
        }
        this.configDraft = draft;
    }
    pathMatches(pattern, parts) {
        const expected = pattern.split('/').slice(1);
        return expected.length === parts.length && expected.every((item, index) => item === '*' || item === parts[index]);
    }
    setAtPath(root, parts, value) {
        let current = root;
        for (const part of parts.slice(0, -1))
            current = current[Array.isArray(current) ? Number(part) : part];
        current[Array.isArray(current) ? Number(parts[parts.length - 1]) : parts[parts.length - 1]] = value;
    }
    async saveConfig(form) {
        if (!this.configInfo || !this.configDocument)
            return;
        this.readConfigDraft(form);
        if (!form.reportValidity())
            return;
        const changed = this.changedConfigPaths(this.configDocument.value, this.configDraft);
        if (changed.length === 0) {
            this.status = '没有尚未保存的修改';
            this.render();
            return;
        }
        const preview = changed.slice(0, 12).map((pathName) => `• ${pathName}`).join('\n');
        const more = changed.length > 12 ? `\n…以及另外 ${changed.length - 12} 项` : '';
        if (!window.confirm(`确认保存 ${changed.length} 项配置修改吗？\n\n${preview}${more}\n\n配置写入后需重新构建和重启游戏。`))
            return;
        this.busy = true;
        this.status = '正在备份并保存…';
        this.render();
        const result = await this.provider.writeConfig(this.configInfo.id, this.configDraft, this.configDocument.revision);
        this.busy = false;
        if (!result.ok) {
            this.status = this.describeWriteFailure(result);
            this.render();
            return;
        }
        await this.loadSelectedConfig();
        this.status = '配置源文件已保存；游戏需按页面步骤重新构建并重启。';
        this.render();
    }
    changedConfigPaths(before, after, at = '') {
        if (JSON.stringify(before) === JSON.stringify(after))
            return [];
        if (before && after && typeof before === 'object' && typeof after === 'object') {
            const a = before;
            const b = after;
            const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
            return Array.from(keys).flatMap((key) => this.changedConfigPaths(a[key], b[key], `${at}/${key}`));
        }
        return [at || '/'];
    }
    renderCharacter(main) {
        main.append(this.heading('角色存档', 'CURRENT DESKTOP SAVE', '编辑此电脑上的当前桌面角色。微信小游戏和浏览器 localStorage 存档暂不在本地后台中管理。'));
        if (!this.character) {
            const empty = node('div', 'empty-card');
            empty.append(node('h3', undefined, this.status.includes('存档') || this.status.includes('save') ? '暂时无法打开角色存档' : '读取本机桌面存档'), node('p', undefined, this.status || '存档由 Electron 的本机用户目录定位。'));
            if (this.status)
                empty.append(this.notice(this.status, true));
            empty.append(button('重新读取', 'secondary', async () => { try {
                this.status = '读取中…';
                this.render();
                await this.loadCharacter();
                this.status = '';
                this.render();
            }
            catch (error) {
                this.status = this.errorMessage(error);
                this.render();
            } }));
            main.append(empty);
            return;
        }
        const panel = node('section', 'panel');
        panel.append(this.panelHeading('角色资料', '仅写入页面列出的资料字段，角色任务、战斗和历史进度会原样保留。'));
        panel.append(node('div', 'revision', `存档修订 ${this.character.revision}`));
        const form = node('form', 'field-grid');
        form.addEventListener('submit', (event) => event.preventDefault());
        this.renderCharacterFields(form, this.character.value);
        panel.append(form);
        panel.append(this.notice('保存前会显示修改字段摘要。存档写入前会自动创建备份；若存档已被游戏或其他操作更改，后台会拒绝覆盖并要求重新读取。'));
        panel.append(this.renderStatus());
        const actions = node('div', 'actions');
        actions.append(button('预览并保存角色', 'primary', () => { void this.saveCharacter(form); }));
        actions.append(button('重新读取', 'secondary', async () => { this.character = null; this.status = ''; this.render(); try {
            await this.loadCharacter();
            this.render();
        }
        catch (error) {
            this.status = this.errorMessage(error);
            this.render();
        } }));
        actions.append(button('查看存档备份', 'secondary', () => { void this.toggleBackups(panel, 'save'); }));
        panel.append(actions);
        main.append(panel);
    }
    renderCharacterFields(form, profile) {
        this.appendTextField(form, 'characterName', profile.characterName ?? '', 'text', '最多 12 个可见字符');
        this.appendSelectField(form, 'characterAvatarId', profile.characterAvatarId, AVATAR_IDS.map((id) => [id, id]));
        this.appendSelectField(form, 'profession', profile.profession, PROFESSION_IDS.map((id) => [id, this.professionNames.get(id) ?? id]));
        const config = this.creationConfig;
        this.appendSelectField(form, 'characterBackground', profile.characterBackground, (config?.backgrounds ?? []).map((id) => [id, config.display.backgrounds[id].name]));
        this.appendSelectField(form, 'destinyId', profile.destinyId, (config?.destinyIds ?? []).map((id) => [id, config.display.destinies[id].name]));
        this.appendTextField(form, 'talentId', profile.talentId ?? '', 'text', '使用 assets/configs/talent.json 中的 ID');
        this.appendAttributeGroup(form, 'innateAttributes', profile.innateAttributes ?? this.emptyAttributes(10), '先天属性', 6, 20);
        this.appendAttributeGroup(form, 'earnedAttributeDelta', profile.earnedAttributeDelta ?? this.emptyAttributes(0), '已获属性变化', 0, 20);
        for (const field of ['cultivationExp', 'careerLevel', 'mind', 'maxMind', 'performance', 'salary', 'spiritStones']) {
            const raw = profile[field];
            this.appendTextField(form, field, String(raw ?? ''), 'number', field === 'careerLevel' ? '正整数' : '非负整数');
        }
    }
    emptyAttributes(value) {
        return Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, value]));
    }
    appendTextField(form, fieldName, value, type, hint = '') {
        const field = node('div', 'field');
        const label = node('label');
        label.append(node('span', undefined, CHARACTER_LABELS[fieldName] ?? fieldName));
        field.append(label);
        const input = node('input');
        input.type = type;
        input.value = value;
        input.dataset.profileField = fieldName;
        input.required = fieldName === 'characterName';
        if (NUMERIC_CHARACTER_FIELDS.has(fieldName)) {
            input.step = '1';
            input.min = fieldName === 'careerLevel' || fieldName === 'maxMind' ? '1' : '0';
        }
        field.append(input);
        if (hint)
            field.append(node('p', 'field-hint', hint));
        form.append(field);
    }
    appendSelectField(form, fieldName, selected, options) {
        const field = node('div', 'field');
        const label = node('label');
        label.append(node('span', undefined, CHARACTER_LABELS[fieldName] ?? fieldName));
        field.append(label);
        const select = node('select');
        select.dataset.profileField = fieldName;
        const empty = node('option');
        empty.value = '';
        empty.textContent = '未选择';
        select.append(empty);
        for (const [id, title] of options) {
            const option = node('option');
            option.value = id;
            option.textContent = `${title} · ${id}`;
            select.append(option);
        }
        select.value = selected ?? '';
        field.append(select);
        form.append(field);
    }
    appendAttributeGroup(form, fieldName, values, title, min, max) {
        const heading = node('div', 'section-title', title);
        heading.style.gridColumn = '1 / -1';
        form.append(heading);
        for (const key of ATTRIBUTE_KEYS) {
            const field = node('div', 'field');
            const label = node('label');
            label.append(node('span', undefined, ATTRIBUTE_LABELS[key]));
            label.append(node('small', undefined, fieldName));
            field.append(label);
            const input = node('input');
            input.type = 'number';
            input.step = '1';
            input.min = String(min);
            input.max = String(max);
            input.value = String(values[key] ?? min);
            input.dataset.attributeGroup = fieldName;
            input.dataset.statKey = key;
            field.append(input);
            form.append(field);
        }
    }
    async saveCharacter(form) {
        if (!this.character)
            return;
        if (!form.reportValidity())
            return;
        const patch = this.readCharacterPatch(form);
        const changed = Object.keys(patch);
        if (!changed.length) {
            this.status = '没有尚未保存的修改';
            this.render();
            return;
        }
        const summary = changed.map((key) => `• ${CHARACTER_LABELS[key] ?? key}: ${JSON.stringify(this.character.value[key])} → ${JSON.stringify(patch[key])}`).join('\n');
        if (!window.confirm(`确认修改以下 ${changed.length} 个角色字段吗？\n\n${summary}\n\n写入前会自动创建存档备份。`))
            return;
        this.busy = true;
        this.status = '正在备份并保存角色…';
        this.render();
        const result = await this.provider.writeCurrentCharacter(patch, this.character.revision);
        this.busy = false;
        if (!result.ok) {
            this.status = this.describeWriteFailure(result);
            this.render();
            return;
        }
        await this.loadCharacter();
        this.status = '角色资料已保存到本机桌面存档。';
        this.render();
    }
    readCharacterPatch(form) {
        const patch = {};
        for (const input of Array.from(form.querySelectorAll('[data-profile-field]'))) {
            const key = input.dataset.profileField;
            let value = input.value;
            if (input.value === '' && key !== 'talentId')
                continue;
            if (NUMERIC_CHARACTER_FIELDS.has(key)) {
                if (input.value.trim() === '')
                    continue;
                value = Number(input.value);
            }
            else if (key === 'talentId' && input.value === '')
                value = null;
            const current = this.character.value[key];
            if (JSON.stringify(current ?? null) !== JSON.stringify(value ?? null))
                patch[key] = value;
        }
        for (const group of ['innateAttributes', 'earnedAttributeDelta']) {
            const inputs = Array.from(form.querySelectorAll(`[data-attribute-group="${group}"]`));
            const value = Object.fromEntries(inputs.map((input) => [input.dataset.statKey, Number(input.value)]));
            const source = this.character.value[group] ?? {};
            const fallback = group === 'innateAttributes' ? 10 : 0;
            const current = Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, source[key] ?? fallback]));
            if (JSON.stringify(current) !== JSON.stringify(value))
                patch[group] = value;
        }
        return patch;
    }
    async toggleBackups(panel, target) {
        const old = panel.querySelector('.backup-panel');
        if (old) {
            old.remove();
            return;
        }
        const section = node('div', 'backup-panel');
        section.append(node('div', 'section-title', target === 'config' ? '配置备份' : '角色存档备份'));
        try {
            const backups = await this.provider.listBackups(target, target === 'config' ? this.selectedConfigId ?? undefined : undefined);
            if (!backups.length)
                section.append(node('p', 'field-hint', '还没有备份。每次成功保存前都会自动创建一份。'));
            for (const backup of backups)
                section.append(this.backupRow(backup));
        }
        catch (error) {
            section.append(this.notice(this.errorMessage(error), true));
        }
        panel.append(section);
    }
    backupRow(backup) {
        const row = node('div', 'backup-row');
        const details = node('div');
        details.append(node('strong', undefined, backup.createdAt), node('span', undefined, `${Math.ceil(backup.sizeBytes / 1024)} KB · 来源修订 ${backup.sourceRevision.slice(0, 12)}`));
        row.append(details, button('恢复此备份', 'danger', () => { void this.restoreBackup(backup); }));
        return row;
    }
    async restoreBackup(backup) {
        const expected = backup.target === 'save' ? this.character?.revision : this.configDocument?.revision;
        if (!expected || !window.confirm(`确定从 ${backup.createdAt} 的备份恢复吗？当前数据会先额外备份。`))
            return;
        const result = await this.provider.restoreBackup(backup.id, expected);
        if (!result.ok) {
            this.status = this.describeWriteFailure(result);
            this.render();
            return;
        }
        if (backup.target === 'save')
            await this.loadCharacter();
        else
            await this.loadSelectedConfig();
        this.status = '备份已恢复。';
        this.render();
    }
    heading(title, eyebrow, subtitle) {
        const heading = node('div', 'page-heading');
        const text = node('div');
        text.append(node('div', 'eyebrow', eyebrow), node('h2', undefined, title), node('p', undefined, subtitle));
        heading.append(text);
        return heading;
    }
    panelHeading(title, description) {
        const header = node('div', 'panel-head');
        const text = node('div');
        text.append(node('h3', undefined, title), node('p', undefined, description));
        header.append(text);
        return header;
    }
    notice(text, error = false) { return node('div', `notice${error ? ' error' : ''}`, text); }
    renderStatus() { return node('div', 'status', this.status); }
    describeWriteFailure(result) {
        if (result.ok)
            return '';
        if (result.error.code === 'CONFLICT')
            return '数据已被其他操作修改。请先重新读取最新版本，再重新录入修改。';
        const issues = result.error.issues?.map((item) => `${item.path || '/'}：${item.message}`).join('；');
        return `${result.error.message}${issues ? `（${issues}）` : ''}`;
    }
    errorMessage(error) {
        if (error instanceof AdminProviderError)
            return error.message;
        return error instanceof Error ? error.message : String(error);
    }
    renderError(error) {
        this.root.replaceChildren();
        const card = node('div', 'empty-card');
        card.append(node('h3', undefined, '本机管理服务连接失败'), node('p', undefined, this.errorMessage(error)));
        card.append(button('重新连接', 'secondary', async () => {
            this.root.replaceChildren(node('div', 'loading-card', '正在连接本机管理服务…'));
            try {
                const provider = await LocalHttpAdminProvider.connect();
                new AdminApp(this.root, provider).mount();
            }
            catch (nextError) {
                this.renderError(nextError);
            }
        }));
        this.root.append(card);
    }
}
export function mountAdminApp(root, provider) {
    void new AdminApp(root, provider).mount();
}
async function boot() {
    const root = document.getElementById('app');
    if (!root)
        throw new Error('Missing #app root');
    try {
        const provider = await LocalHttpAdminProvider.connect();
        mountAdminApp(root, provider);
    }
    catch (error) {
        new AdminApp(root, { listConfigs: async () => [], readConfig: async () => { throw error; }, writeConfig: async () => ({ ok: false, error: { code: 'NETWORK_ERROR', message: String(error) } }), readCurrentCharacter: async () => { throw error; }, writeCurrentCharacter: async () => ({ ok: false, error: { code: 'NETWORK_ERROR', message: String(error) } }), listBackups: async () => [], restoreBackup: async () => ({ ok: false, error: { code: 'NETWORK_ERROR', message: String(error) } }) }).renderError(error);
    }
}
void boot();
