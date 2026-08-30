// 数字员工本地壳层 —— i18n 补丁注入。
// 在上游 i18n 初始化之后运行（main.tsx 中紧跟 './i18n' 引入本模块）：
//   - 覆盖：仅品牌措辞差异（Agent→智能体/数字员工、平台用户、消息广场等，16 个 zh 词条）
//   - 新增：本地独有页面的词条（297 个，页面在 Phase D 迁入后生效）
// 上游 v1.11.4 的功能文案演进（软删除提示、Plaza 权限语义等）保持上游原值，不做覆盖。
// 生成方式与词条清单见 LOCAL-LAYER.md。
import i18n from '../i18n';
import zhPatch from './i18n-patch-zh.json';
import enPatch from './i18n-patch-en.json';

i18n.addResourceBundle('zh', 'translation', zhPatch, true, true);
i18n.addResourceBundle('en', 'translation', enPatch, true, true);

export default i18n;
