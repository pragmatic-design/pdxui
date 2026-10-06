// The rating page's first value: the basic and the form-integration ratings show and set the same
// one.
@store ratingDemo;

let rating1 = $signal(3);

function onRating1(e) {
  rating1 = e.detail.value;
}
