// TipTap JSON -> HTML konvertor pro mongosh (cisty JS, bez zavislosti).
// Vklada se na zacatek mongosh skriptu (fix-content-html.yml).
function __esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function __escAttr(s){return __esc(s).replace(/"/g,'&quot;');}
function __applyMarks(text,marks){
  var h=__esc(text);
  (marks||[]).forEach(function(m){
    var a=m.attrs||{};
    switch(m.type){
      case 'bold': h='<strong>'+h+'</strong>'; break;
      case 'italic': h='<em>'+h+'</em>'; break;
      case 'underline': h='<u>'+h+'</u>'; break;
      case 'strike': h='<s>'+h+'</s>'; break;
      case 'code': h='<code>'+h+'</code>'; break;
      case 'superscript': h='<sup>'+h+'</sup>'; break;
      case 'subscript': h='<sub>'+h+'</sub>'; break;
      case 'link': h='<a href="'+__escAttr(a.href||'')+'"'+(a.target?' target="'+__escAttr(a.target)+'"':'')+(a.rel?' rel="'+__escAttr(a.rel)+'"':'')+'>'+h+'</a>'; break;
      case 'textStyle': { var st=[]; if(a.color)st.push('color:'+a.color); if(a.fontFamily)st.push('font-family:'+a.fontFamily); if(st.length)h='<span style="'+__escAttr(st.join(';'))+'">'+h+'</span>'; break; }
      case 'fontSize': { if(a.size)h='<span style="font-size:'+__escAttr(a.size)+'">'+h+'</span>'; break; }
      default: break;
    }
  });
  return h;
}
function __inner(n){return (n.content||[]).map(__nodeToHtml).join('');}
function __nodeToHtml(n){
  if(!n||typeof n!=='object')return '';
  switch(n.type){
    case 'doc': return __inner(n);
    case 'paragraph': return '<p>'+__inner(n)+'</p>';
    case 'text': return __applyMarks(n.text||'',n.marks);
    case 'hardBreak': return '<br>';
    case 'horizontalRule': return '<hr>';
    case 'heading': { var lvl=Math.min(6,Math.max(1,(n.attrs&&n.attrs.level)||1)); return '<h'+lvl+'>'+__inner(n)+'</h'+lvl+'>'; }
    case 'bulletList': return '<ul>'+__inner(n)+'</ul>';
    case 'orderedList': return '<ol>'+__inner(n)+'</ol>';
    case 'listItem': return '<li>'+__inner(n)+'</li>';
    case 'blockquote': return '<blockquote>'+__inner(n)+'</blockquote>';
    case 'codeBlock': return '<pre><code>'+__esc(__inner(n))+'</code></pre>';
    case 'image': { var a=n.attrs||{}; return '<img src="'+__escAttr(a.src||'')+'"'+(a.alt?' alt="'+__escAttr(a.alt)+'"':'')+'>'; }
    default: return __inner(n);
  }
}
function tiptapToHtml(content){
  if(typeof content!=='string')return content;
  var t=content.trim();
  if(t.charAt(0)!=='{')return content;
  var doc; try{doc=JSON.parse(t);}catch(e){return content;}
  if(!doc||doc.type!=='doc')return content;
  return __nodeToHtml(doc);
}
