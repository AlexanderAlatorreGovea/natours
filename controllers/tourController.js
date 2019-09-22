//const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const Tour = require('../models/toursModel');
const catchAsync = require('./../utils/catchAsync');
const factory = require('./handlerFactory');
const AppError = require('./../utils/appError');

const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter
});

exports.uploadTourImages = upload.fields([
  { name: 'imageCover', maxCount: 1 },
  { name: 'images', maxCount: 3 }
]);

exports.resizeTourImages = catchAsync(async (req, res, next) => {
  if (!req.files.imageCover || !req.files.images) return next();

  // 1) Cover image
  req.body.imageCover = `tour-${req.params.id}-${Date.now()}-cover.jpeg`;
  await sharp(req.files.imageCover[0].buffer)
    .resize(2000, 1333)
    .toFormat('jpeg')
    .jpeg({ quality: 90 })
    .toFile(`public/img/tours/${req.body.imageCover}`);

  // 2) Images
  req.body.images = [];

  await Promise.all(
    req.files.images.map(async (file, i) => {
      const filename = `tour-${req.params.id}-${Date.now()}-${i + 1}.jpeg`;

      await sharp(file.buffer)
        .resize(2000, 1333)
        .toFormat('jpeg')
        .jpeg({ quality: 90 })
        .toFile(`public/img/tours/${filename}`);

      req.body.images.push(filename);
    })
  );

  next();
});

exports.aliasTopTours = (req, res, next) => {
  //console.log(req.query);
  req.query.limit = '5';
  req.query.sort = '-ratingsAverage,price';
  req.query.fields = 'name,price,ratingsAverage,summary,difficulty';
  next();
};

exports.getAllTours = factory.getAll(Tour);
//path is the path we want to execute
exports.getTour = factory.getOne(Tour, { path: 'reviews' });
exports.createTour = factory.createOne(Tour);
exports.updateTour = factory.updateOne(Tour);
exports.deleteTour = factory.deleteOne(Tour);

exports.getTourStats = catchAsync(async (req, res, next) => {
  const stats = await Tour.aggregate([
    {
      $match: { ratingsAverage: { $gte: 4.5 } }
    },
    {
      $group: {
        //groups by difficulty so it sorts by easy , difficutl, and easy
        _id: { $toUpper: '$difficulty' },
        //you can also grou by average price by saying
        // _id: '$ratingsAverage',
        numTours: { $sum: 1 },
        numRatings: { $sum: '$ratingsQuantity' },
        avgRating: { $avg: '$ratingsAverage' },
        avgPrice: { $avg: '$price' },
        minPrice: { $min: '$price' },
        maxPrice: { $max: '$price' }
      }
    },
    {
      //we need to use the names from above because they are grouped by id
      //sort by average price andwe use 1 for ascending
      $sort: { avgPrice: 1 }
    }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      stats
    }
  });
});
//this gives us in json that july is the busiest month w/ 3 tours starting on this date
exports.getMonthlyPlan = catchAsync(async (req, res) => {
  const year = req.params.year * 1; // 2021

  const plan = await Tour.aggregate([
    //deconstructs an element and creates a new field
    {
      $unwind: '$startDates'
    },
    {
      $match: {
        startDates: {
          //we want our date to be greater than or equal to Jan -01- 01
          // and less dant 01-12-31
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`)
        }
      }
    },
    {
      $group: {
        //we want to group by the month
        _id: { $month: '$startDates' },
        //we count the number of months that start
        numTourStarts: { $sum: 1 },
        //which tours start wit this months
        tours: { $push: '$name' }
      }
    },
    {
      $addFields: {
        month: '$_id'
      }
    },
    {
      $project: {
        _id: 0
      }
    },
    {
      $sort: { numTourStarts: -1 }
    },
    {
      //limits the query to 12 outputs
      $limit: 12
    }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      plan
    }
  });
});

// /tours-within/:distance/center/:latlng/unit/:unit
// /tours-within/233/center/34.111745,-118.113491/unit/mi
exports.getToursWithin = catchAsync(async (req, res, next) => {
  const { distance, latlng, unit } = req.params;
  const [lat, lng] = latlng.split(',');

  const radius = unit === 'mi' ? distance / 3963.2 : distance / 6378.1;

  if (!lat || !lng) {
    next(
      new AppError(
        'Please provide latitutr and longitude in the format lat,lng.',
        400
      )
    );
  }
  //geowithin finds documentd within a certain lat and longitude
  const tours = await Tour.find({
    startLocation: { $geoWithin: { $centerSphere: [[lng, lat], radius] } }
  });

  res.status(200).json({
    status: 'success',
    results: tours.length,
    data: {
      data: tours
    }
  });
});

exports.getDistances = catchAsync(async (req, res, next) => {
  const { latlng, unit } = req.params;
  const [lat, lng] = latlng.split(',');

  const multiplier = unit === 'mi' ? 0.000621371 : 0.001;

  if (!lat || !lng) {
    next(
      new AppError(
        'Please provide latitutr and longitude in the format lat,lng.',
        400
      )
    );
  }

  const distances = await Tour.aggregate([
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [lng * 1, lat * 1]
        },
        distanceField: 'distance',
        distanceMultiplier: multiplier
      }
    },
    {
      $project: {
        distance: 1,
        name: 1
      }
    }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      data: distances
    }
  });
});

/*
exports.getAllTours = catchAsync(async (req, res) => {
  const features = new APIFeatures(Tour.find(), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();
  const tours = await features.query;

  // SEND RESPONSE
  res.status(200).json({
    status: 'success',
    results: tours.length,
    data: {
      tours
    }
  });
  //this sorts by difficulty and duration
  //{ ...req.query } is a shallow copy of req.query because we do not want to delete or modify the actual req.query
  //BUILD QUERIE
  //1A)FILTERING
  // const queryObj = { ...req.query };
  // const excludedFields = ['page', 'sort', 'limit', 'fields'];
  // //this deletes the field w/ the current element in the array
  // excludedFields.forEach(el => queryObj[el]);

  // //1B)ADVANCED FILTERING
  // // { difficulty: 'easy', duration: { $gte: 5 } }
  // //gte, gt, lte, lt
  // let queryStr = JSON.stringify(queryObj);
  // queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);

  // let query = Tour.find(JSON.parse(queryStr));

  //2) SORTING
  //sorts from price lower to higher
  // if (req.query.sort) {
  //   const sortBy = req.query.sort.split(',').join(' ');
  //   query = query.sort(sortBy);
  //   //sort('price')
  // } else {
  //   query = query.sort('-createdAt');
  // }

  // const tours = await Tour.find()
  //   .where('duration')
  //   .equals(5)
  //   .where('difficulty')
  //   .equals('easy');

  //3) FIELD LIMITING

  // // if (req.query.fields) {
  // //   const fields = req.query.fields.split(',').join(' ');
  // //   query = query.select(fields);
  // // } else {
  // //   //this excludes __v
  // //   query.select('-__v');
  // // }

  //4) PAGINATION
  // const page = req.query.page * 1 || 1;
  // const limit = req.query.limit * 1 || 100;
  // const skip = (page - 1) * limit;

  //page=2&limit=10 1-10 for page 11-20 - 20 are the next 10 you skip
  // query = query.skip(skip).limit(limit);

  // if (req.query.page) {
  //   const numberOfTours = await Tour.countDocuments();
  //   if (skip >= numberOfTours) throw new Error('This page does not exist');
  // }

  //EXECUTES QUERY
});*/
/*
///this will gives us back the tour with the ID of 5 if we put a 5 at the end of the string /api/v1/tours/5
exports.getTour = catchAsync(async (req, res, next) => {
  //req.params.id because we called the end of the string :id
  //we want to fill up thefield name guides in our model, so we fill it up with the data
  const tour = await Tour.findById(req.params.id).populate('reviews');

  if (!tour) {
    return next(new AppError('No tour found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      tour
    }
  });
});

exports.createTour = catchAsync(async (req, res, next) => {
  const newTour = await Tour.create(req.body);

  res.status(201).json({
    status: 'success',
    data: {
      tour: newTour
    }
  });
  // // try {
  // //   // const newTour = new Tour({})
  // //   // newTour.save()
  // // } catch (err) {
  // //   res.status(400).json({
  // //     status: 'fail',
  // //     message: err
  // //   });
  // // }
}); 

//patch to update the data
exports.updateTour = catchAsync(async (req, res, next) => {
  const tour = await Tour.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  if (!tour) {
    return next(new AppError('No tour found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      tour
    }
  });
});

//deleting a resource
exports.deleteTour = catchAsync(async (req, res, next) => {
  const tour = await Tour.findByIdAndDelete(req.params.id);

  if (!tour) {
    return next(new AppError('No tour found with that ID', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});
*/

/* 

CONTROLLER BEFORE BEING WRAPPED IN A function 


exports.getAllTours = catchAsync(async (req, res) => {
  try {
    //this sorts by difficulty and duration
    //{ ...req.query } is a shallow copy of req.query because we do not want to delete or modify the actual req.query
    //BUILD QUERIE
    //1A)FILTERING
    // const queryObj = { ...req.query };
    // const excludedFields = ['page', 'sort', 'limit', 'fields'];
    // //this deletes the field w/ the current element in the array
    // excludedFields.forEach(el => queryObj[el]);

    // //1B)ADVANCED FILTERING
    // // { difficulty: 'easy', duration: { $gte: 5 } }
    // //gte, gt, lte, lt
    // let queryStr = JSON.stringify(queryObj);
    // queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);

    // let query = Tour.find(JSON.parse(queryStr));

    //2) SORTING
    //sorts from price lower to higher
    // if (req.query.sort) {
    //   const sortBy = req.query.sort.split(',').join(' ');
    //   query = query.sort(sortBy);
    //   //sort('price')
    // } else {
    //   query = query.sort('-createdAt');
    // }

    // const tours = await Tour.find()
    //   .where('duration')
    //   .equals(5)
    //   .where('difficulty')
    //   .equals('easy');

    //3) FIELD LIMITING

    // // if (req.query.fields) {
    // //   const fields = req.query.fields.split(',').join(' ');
    // //   query = query.select(fields);
    // // } else {
    // //   //this excludes __v
    // //   query.select('-__v');
    // // }

    //4) PAGINATION
    // const page = req.query.page * 1 || 1;
    // const limit = req.query.limit * 1 || 100;
    // const skip = (page - 1) * limit;

    //page=2&limit=10 1-10 for page 11-20 - 20 are the next 10 you skip
    // query = query.skip(skip).limit(limit);

    // if (req.query.page) {
    //   const numberOfTours = await Tour.countDocuments();
    //   if (skip >= numberOfTours) throw new Error('This page does not exist');
    // }

    //EXECUTES QUERY
    const features = new APIFeatures(Tour.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();
    const tours = await features.query;
    //SENDS RESPONSE
    res.status(200).json({
      status: 'success',
      results: tours.length,
      data: {
        tours
      }
    });
  } catch (err) {
    res.status(404).json({
      status: 'fail',
      message: err
    });
  }
});

///this will gives us back the tour with the ID of 5 if we put a 5 at the end of the string /api/v1/tours/5
exports.getTour = async (req, res) => {
  //req.params.id because we called the end of the string :id
  try {
    const tour = await Tour.findById(req.params.id);

    res.status(200).json({
      status: 'success',
      data: {
        tour
      }
    });
  } catch (err) {
    res.status(404).json({
      status: 'fail',
      message: err
    });
  }
};

exports.createTour = catchAsync(async (req, res, next) => {
  const newTour = await Tour.create(req.body);

  res.status(201).json({
    status: 'success',
    data: {
      tour: newTour
    }
  });
  // // try {
  // //   // const newTour = new Tour({})
  // //   // newTour.save()
  // // } catch (err) {
  // //   res.status(400).json({
  // //     status: 'fail',
  // //     message: err
  // //   });
  // // }
});

//patch to update the data
exports.updateTour = async (req, res) => {
  try {
    const tour = await Tour.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    res.status(200).json({
      status: 'success',
      data: {
        tour
      }
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: 'invalid data set'
    });
  }
};

//deleting a resource
exports.deleteTour = async (req, res) => {
  try {
    await Tour.findByIdAndDelete(req.params.id);

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: 'invalid data set'
    });
  }
};
/* 
api done w/ vanilla nodejs

//const fs = require('fs');
const Tour = require('../models/toursModel');

// exports.checkID = (req, res, next, val) => {
//   // eslint-disable-next-line no-console
//   console.log(`tour id is : ${val}`);
//   if (req.params.id * 1 > tours.length) {
//     return res.status(404).json({
//       status: 'fail',
//       message: 'invalid ID'
//     });
//   }
//   next();
// };

//this states that if when we are create a new tour, if we do not have
//the price or the name of the tour, it will send back a 400 error
exports.checkBody = (req, res, next) => {
  if (!req.body.name || req.body.price) {
    return res.status(400).json({
      status: 'fail',
      message: 'missing name or price'
    });
  }
  next();
};

exports.getAllTours = (req, res) => {
  res.status(200).json({
    status: 'success',
    results: tours.length,
    data: {
      tours
    }
  });
};

///this will gives us back the tour with the ID of 5 if we put a 5 at the end of the string /api/v1/tours/5
exports.getTour = (req, res) => {
  //req.params is the :id that will be put at the end of the request
  //console.log(req.params);
  //the id has to be a number and rn it is a string, in javascritpt if we multiply a string, it is converted into a number
  const id = req.params.id * 1;
  const tour = tours.find(el => el.id === id);

  res.status(200).json({
    status: 'success',
    data: {
      tour
    }
  });
};

exports.createTour = (req, res) => {
  const newId = tours[tours.length - 1].id + 1;
  //Object.assing will concatenate the object into the existing data
  const newTour = Object.assign({ id: newId }, req.body);
  //pushes the new tour into the original tour with the newID
  tours.push(newTour);
  //fs.writeFileSync is the data we want to write tours
  //tours is the data we want to write, which is the second argument,
  //the third argument is  a call back function
  //make the object a string with JSON.stringify of the tours object
  fs.writeFile(
    `${__dirname}/dev-data/data/tours-simple.json`,
    JSON.stringify(tours),
    _err => {
      res.status(201).json({
        status: 'success',
        data: {
          tour: newTour
        }
      });
    }
  );
};

//patch to update the data
exports.updateTour = (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      tour: '<Updated tour goes here!>'
    }
  });
};

//deleting a resource
exports.deleteTour = (req, res) => {
  res.status(204).json({
    status: 'success',
    data: null
  });
};


*/
