// Homepage presentation only. Coordinates follow the supplied 490x924 reference.
module.exports = function applyHomeReference(b) {
  const refs = require('../assets/textures/ui/home/reference-manifest.json');
  const get = name => b.objects.findIndex(o => o.__type__ === 'cc.Node' && o._name === name);
  const components = id => b.objects[id]._components.map(r => b.objects[r.__id__]);
  const layout = (name,x,y,w,h) => {
    const id=get(name), n=b.objects[id]; n._lpos=b.vec3(x,y,0);
    for(const c of components(id)) {
      if(c.__type__==='cc.UITransform') c._contentSize=b.size(w,h);
      if(c.__type__==='cc.Widget') c._enabled=false;
    }
    return id;
  };
  const label=(name,size,color)=>{
    const c=components(get(name)).find(c=>c.__type__==='cc.Label');
    if(c) Object.assign(c,{_fontSize:size,_actualFontSize:size,_lineHeight:size+5,_overflow:2,_color:b.color(...color),_fontFamily:'Microsoft YaHei'});
  };
  const panel=(name,color)=>{
    for(const c of components(get(name))) if(c.__type__==='cc.Graphics') {
      c._fillColor=b.color(...color);c._strokeColor=b.color(...color);
    }
  };
  const removeRender=name=>{
    for(const c of components(get(name))) if(c.__type__==='cc.Graphics'||c.__type__==='9d3c5ajahRK77mt3Dp3Hysh')c._enabled=false;
  };
  const art=(parent,name,key,x,y,w,h)=>{
    const id=b.addNode(name,get(parent),[],[],{lpos:b.vec3(x,y,0)});
    b.addUITransform(id,w,h);b.addSprite(id,{__uuid__:refs[key],__expectedType__:'cc.SpriteFrame'});
    b.objects[get(parent)]._children.push(b.ref(id));return id;
  };
  const hide=name=>{b.objects[get(name)]._active=false;};
  const white=[255,248,230,255],ink=[35,40,37,255],teal=[31,61,69,255];
  layout('PaperContent',0,0,720,1280); panel('PaperContent',[245,237,219,255]);
  layout('TopHeader',0,0,720,1280);removeRender('TopHeader');
  hide('BrandLabel');hide('BrandTaglineLabel');hide('CareerSummaryLabel');
  art('TopHeader','ReferenceBrand','reference-brand',0,543,680,189);
  const settings=b.addNode('HomeSettingsButton',get('TopHeader'),[],[],{lpos:b.vec3(292,471,0)});
  b.addUITransform(settings,76,64);b.addButton(settings);
  b.objects[get('TopHeader')]._children.push(b.ref(settings));
  layout('ResourceBar',0,268,676,88);removeRender('ResourceBar');
  ['Cultivation','Salary','Performance','Mind'].forEach((part,i)=>{
    const name='Resource'+part+'Chip'; layout(name,(i-1.5)*169,0,160,88);
    panel(name,[39,137,157,255]);hide(name+'Icon');
    layout(part+'ResourceLabel',12,0,134,78);label(part+'ResourceLabel',23,white);
    art(name,name+'Artwork','reference-'+part.toLowerCase(),-54,18,30,31);
  });
  layout('CharacterArea',0,0,720,1280);removeRender('CharacterArea');
  hide('CharacterBackdrop');hide('CharacterIconLabel');hide('CharacterStatusLabel');hide('CharacterHintLabel');
  // CharacterArea follows ResourceBar: append only illustration regions, never a full-page screenshot.
  art('CharacterArea','ReferenceOffice','reference-office',0,-20,720,339);
  art('CharacterArea','ReferenceAvatar','reference-avatar',-276,388,108,111);
  layout('CharacterNameLabel',70,366,450,48);label('CharacterNameLabel',25,ink);
  const profile=b.addTextNode('HomeProfileTitle','修仙打工人',450,48,{fontSize:32,color:b.color(...ink),lpos:b.vec3(70,410,0)});
  b.objects[get('CharacterArea')]._children.push(b.ref(profile));
  const quote=b.addTextNode('HomeReferenceQuote','“摸鱼不违法，修仙不内卷！”',650,48,{fontSize:27,color:b.color(...ink),lpos:b.vec3(0,185,0)});
  b.objects[get('CharacterArea')]._children.push(b.ref(quote));
  layout('IdleIncomePanel',0,-288,658,152);panel('IdleIncomePanel',teal);
  layout('WorkStatusLabel',0,22,624,58);label('WorkStatusLabel',22,white);
  layout('IdleEfficiencyLabel',0,-38,610,42);label('IdleEfficiencyLabel',22,white);
  // Leave a small visual breathing gap before the fixed navigation bar.
  layout('PrimaryActions',0,-440,680,212);panel('PrimaryActions',teal);
  layout('CultivateButton',0,49,438,87);panel('CultivateButton',[250,194,74,255]);
  layout('WorkButton',-175,-65,316,94);panel('WorkButton',[56,159,204,255]);
  layout('FishButton',175,-65,316,94);panel('FishButton',[81,166,100,255]);
  for(const [name,w,h] of [['Cultivate',438,87],['Work',316,94],['Fish',316,94]]) {
    layout(name+'ButtonLabel',0,0,w-12,h-8);label(name+'ButtonLabel',30,name==='Cultivate'?ink:white);
  }
  layout('BottomNavigation',0,-597,720,86);panel('BottomNavigation',teal);
  ['Home','Tasks','Craft','Promotion','More'].forEach((name,i)=>{
    layout('Tab'+name,(i-2)*140,0,132,84);removeRender('Tab'+name);hide('Tab'+name+'Icon');
    layout('Tab'+name+'Label',0,-24,130,30);label('Tab'+name+'Label',21,i===0?[255,220,134,255]:white);
    art('Tab'+name,'ReferenceNav'+name,'reference-'+name.toLowerCase(),0,16,48,36);
  });
};
