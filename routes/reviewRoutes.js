const express = require('express');
const reviewController = require('./../controllers/reviewController');
const authController = require('./../controllers/authController');

//this merges /api/v1/tours with /:tourId/reviews to get access to the id and be rerouted to reviews
const router = express.Router({ mergeParams: true });

router.use(authController.protect);

//POST /reviews or
// POST /tour/234fad4/reviews or the one below
// GET /tour/234fad4/reviews

router
  .route('/')
  .get(reviewController.getAllReviews)
  .post(
    authController.restrictTo('user'),
    reviewController.setTourUserIds,
    reviewController.createReview
  );

router
  .route('/:id')
  .get(reviewController.getReview)
  .patch(
    authController.restrictTo('user', 'admin'),
    reviewController.updateReview
  )
  .delete(
    authController.restrictTo('user', 'admin'),
    reviewController.deleteReview
  );

module.exports = router;
