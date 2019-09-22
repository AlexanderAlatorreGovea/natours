/* eslint-disable */
import axios from 'axios';
import { showAlert } from './alerts';
const stripe = Stripe('pk_test_Hf57iAx5mdXgGnkvekE97aqK00NsdvL39K');

export const bookTour = async tourId => {
  try {
    // 1) Get checkout session from API
    //this is a get request without being explicitly stated
    const session = await axios(`/api/v1/bookings/checkout-session/${tourId}`);
    // console.log(session);

    // 2) Create checkout form + chanre credit card
    await stripe.redirectToCheckout({
      sessionId: session.data.session.id
    });
  } catch (err) {
    console.log(err);
    showAlert('error', err);
  }
};