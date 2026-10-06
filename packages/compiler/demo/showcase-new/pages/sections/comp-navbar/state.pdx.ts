// The navbar page's event line: the basic and the enterprise navbars write it, the enterprise
// section shows it.
@store navbarEvents;

let navbarLog = $signal('Click a nav link or menu item...');

function onNav(e) {
  navbarLog = 'pdx-select: ' + e.detail.key;
}
