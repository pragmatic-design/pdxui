// The segmented page's billing period: the object-options and the form-integration controls show
// and set the same one.
@store segmentedPeriod;

let period = $signal('monthly');

function onPeriod(e) {
  period = e.detail.value;
}
