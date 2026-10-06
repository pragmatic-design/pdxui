// The toggle-group page's alignment and formatting: the single and multiple sections and the editor
// toolbar of the composition section show and set the same two values. The sections
// set them through setAlign/setFormatting: a section reads them as $derived, which it cannot assign.
@store toggleGroupDemo;

let align = $signal('left');
let formatting = $signal('bold');

function setAlign(v) { align = v; }
function setFormatting(v) { formatting = v; }

function sampleStyle() {
  const on = (formatting || '').split(',');
  const deco = [on.includes('underline') ? 'underline' : '', on.includes('strike') ? 'line-through' : ''].filter(Boolean).join(' ');
  return 'font-weight:' + (on.includes('bold') ? '700' : '400')
    + ';font-style:' + (on.includes('italic') ? 'italic' : 'normal')
    + ';text-decoration:' + (deco || 'none');
}
