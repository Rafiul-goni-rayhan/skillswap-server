





const dns = require('node:dns')
dns.setServers(['1.1.1.1', '1.0.0.1'])
const express = require('express')
const dotenv = require('dotenv')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
dotenv.config()

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

const uri = process.env.MONGODB_URI
const app = express()
const PORT = process.env.PORT || 5000


app.use(cors({
  origin: "http://localhost:3000",
  credentials: true,
//   methods: ["GET", "POST", "PUT", "DELETE"],
//   allowedHeaders: ["Content-Type", "Authorization"]
}));


// CORS কনফিগারেশন
// app.use(
// 	cors({
// 		credentials: true,
// 		origin: [process.env.CLIENT_URL || 'http://localhost:3000'],
// 	}),
// )
app.use(express.json())
app.use(cookieParser())

// -------------------------------------------------------------------------
// 🛡️ ব্যাকএন্ড ভেরিফিকেশন মিডলওয়্যার (Challenge 2: JWT Verification)
// -------------------------------------------------------------------------
// -------------------------------------------------------------------------
// 🛡️ ব্যাকএন্ড ভেরিফিকেশন মিডলওয়্যার (ম্যানুয়াল JWT + Better-Auth সেশন সাপোর্ট)
// -------------------------------------------------------------------------
const verifyToken = async (req, res, next) => {
    // ১. প্রথমে ম্যানুয়াল লগইনের কাস্টম JWT টোকেন চেক করা
    const token = req.cookies?.token

    if (token) {
        return jwt.verify(
            token,
            process.env.JWT_SECRET || 'super-secret-key',
            async (err, decoded) => {
                if (err) {
                    return res.status(403).json({
                        success: false,
                        message: 'Forbidden access. Invalid or expired token.',
                    })
                }
                req.user = decoded // ম্যানুয়াল লগইন ইউজার সেট
                return next()
            },
        )
    }

    // ২. টোকেন না থাকলে চেক করা গুগল/সোশ্যাল লগইন (Better-Auth) সেশন
    // try {
    //     if (!auth) {
    //         return res.status(500).json({ success: false, message: "Auth system not initialized yet." })
    //     }

    //     // Better-Auth থেকে সেশন রিড করা
    //     const session = await auth.api.getSession({ headers: req.headers })
        
    //     if (session && session.user) {
    //         // 🎯 মোস্ট ক্রিশিয়াল ফিক্স: সেশনের ইমেইল দিয়ে মঙ্গোডিবির মেইন 'users' কালেকশন থেকে ফ্রেশ ডাটা আনা
    //         const dbUser = await usersCollection.findOne({ 
    //             email: session.user.email.trim() 
    //         });

    //         if (dbUser) {
    //             // ডাটাবেজে যে রোল আছে (যেমন: freelancer বা client), সেটাই এখানে সেট হবে
    //             req.user = {
    //                 id: dbUser._id, 
    //                 email: dbUser.email,
    //                 role: dbUser.role || session.user.role || 'freelancer' // ডাইনামিক রোল অ্যাসাইনমেন্ট
    //             }
    //             return next()
    //         } else {
    //             // ডাটাবেজে ইউজার না পাওয়া গেলে সেশনের ডিফল্ট ডাটা ব্যবহার করা
    //             req.user = {
    //                 id: session.user.id,
    //                 email: session.user.email,
    //                 role: session.user.role || 'freelancer'
    //             }
    //             return next()
    //         }
    //     }
    // } catch (sessionErr) {
    //     console.error("Better-Auth session verification error in middleware:", sessionErr)
    // }

    // ৩. কোনো অথ মেকানিজমই যদি সেশন খুঁজে না পায়
    return res
        .status(401)
        .json({ success: false, message: 'Unauthorized access. Token or Session missing.' })
}


// const verifyToken = async (req, res, next) => {
//     // ১. প্রথমে ম্যানুয়াল লগইনের কাস্টম টোকেন চেক করা
//     const token = req.cookies?.token

//     if (token) {
//         return jwt.verify(
//             token,
//             process.env.JWT_SECRET || 'super-secret-key',
//             async (err, decoded) => {
//                 if (err) {
//                     return res.status(403).json({
//                         success: false,
//                         message: 'Forbidden access. Invalid or expired token.',
//                     })
//                 }
//                 req.user = decoded // ম্যানুয়াল লগইন ইউজার সেট
//                 return next()
//             },
//         )
//     }

//     // ২. টোকেন না থাকলে চেক করা গুগল লগইন (Better-Auth) সেশন আছে কি না
//     try {
//         const session = await auth.getSession({ headers: req.headers })
        
//         if (session && session.user) {
//             // সেশনের ইমেইল দিয়ে মঙ্গোডিবির মেইন 'users' কালেকশন থেকে ডাটা আনা
//             const dbUser = await usersCollection.findOne({ 
//                 email: session.user.email.trim() 
//             });

//             if (dbUser) {
//                 req.user = {
//                     id: dbUser._id, // মঙ্গোডিবির ওরিজনাল ObjectId পাস হবে
//                     email: dbUser.email,
//                     role: dbUser.role || 'client' // ডাটাবেজের আসল রোল
//                 }
//                 return next()
//             } else {
//                 req.user = {
//                     id: session.user.id,
//                     email: session.user.email,
//                     role: session.user.role || 'client'
//                 }
//                 return next()
//             }
//         }
//     } catch (sessionErr) {
//         console.error("Better-Auth session verification error in middleware:", sessionErr)
//     }

//     // ৩. দুটি অথ মেকানিজমই যদি ফেইল করে
//     return res
//         .status(401)
//         .json({ success: false, message: 'Unauthorized access. Token or Session missing.' })
// }

const client = new MongoClient(uri, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
})

// গ্লোবাল কালেকশন ভ্যারিয়েবল
let usersCollection
let tasksCollection
let proposalsCollection
let paymentsCollection
let reviewsCollection

async function run() {
	try {
		const db = client.db('skillswap')

		// কালেকশনগুলো অ্যাসাইন করা হলো (ডুপ্লিকেট রিমুভড)
		usersCollection = db.collection('users')
		tasksCollection = db.collection('tasks')
		proposalsCollection = db.collection('proposals')
		paymentsCollection = db.collection('payments')
		reviewsCollection = db.collection('reviews')

        // ... collections initialization ...

// 🎯 Better-Auth মেইন রুট হ্যান্ডলার (অন্য সব API-এর ওপরে থাকবে)
// app.all("/api/auth", (req, res) => {
//     if (!auth) {
//         return res.status(500).json({ success: false, message: "Auth system not initialized yet." });
//     }
//     return auth.handler(req, res);
// });

// ... এর নিচে আপনার অন্যান্য সাধারণ API রুটগুলো থাকবে (যেমন: /api/freelancers, /api/home-data) ...


		// -------------------------------------------------------------------------
		// ১. ইউজার রেজিস্ট্রেশন এপিআই
		// -------------------------------------------------------------------------
	app.post('/api/register', async (req, res) => {
    try {
        const { name, email, image, password, role } = req.body

        // ১. বেসিক ভ্যালিডেশন: শুধুমাত্র রিকোয়েস্টে ফিল্ডগুলো আছে কি না চেক করবে
        if (!name || !email || !image || !password) {
            return res.status(400).json({
                success: false,
                message: 'All fields (Name, Email, Image, Password) are required.',
            })
        }

        // ২. ডুপ্লিকেট ইউজার চেক
        const existingUser = await usersCollection.findOne({
            email: email.trim(),
        })
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email.',
            })
        }

        // 🚀 পাসওয়ার্ড পলিসির সব ধরনের বাধা (যেমন: Capital letter, Number) পুরোপুরি রিমুভড।
        // ইউজার ইনপুটে যে পাসওয়ার্ডই দিক না কেন, সেটিই সরাসরি ডাটাবেজে যাবে।
        const newUser = {
            name: name.trim(),
            email: email.trim(),
            image: image.trim(),
            password: password.trim(), // যা ইচ্ছা তা পাসওয়ার্ড এখানে চলে আসবে
            role: role === 'freelancer' ? 'freelancer' : 'client',
            skills: [],
            bio: '',
            isBlocked: false,
            createdAt: new Date(),
        }

        const result = await usersCollection.insertOne(newUser)
        return res.status(201).json({
            success: true,
            message: 'User registered successfully!',
            data: result,
        })
    } catch (error) {
        console.error('Register API Error:', error)
        return res
            .status(500)
            .json({ success: false, message: 'Internal server error.' })
    }
})
		// -------------------------------------------------------------------------
		// ২. ইউজার লগইন এপিআই এবং JWT জেনারেশন
		// -------------------------------------------------------------------------
		app.post('/api/login', async (req, res) => {
			try {
				const { email, password } = req.body

				if (!email || !password) {
					return res.status(400).json({
						success: false,
						message: 'Email and password are required.',
					})
				}

				const user = await usersCollection.findOne({ email: email.trim() })
				if (!user) {
					return res.status(404).json({
						success: false,
						message: 'User not found with this email. Please register first.',
					})
				}

				if (user.isBlocked) {
					return res.status(403).json({
						success: false,
						message: 'Your account has been blocked by Admin.',
					})
				}

				const dbPassword = user.password ? user.password.toString().trim() : ''
				const inputPassword = password ? password.toString().trim() : ''

				if (dbPassword !== inputPassword) {
					return res.status(401).json({
						success: false,
						message: 'Invalid credentials. Password did not match.',
					})
				}

				const token = jwt.sign(
					{ id: user._id, email: user.email, role: user.role },
					process.env.JWT_SECRET || 'super-secret-key',
					{ expiresIn: '7d' },
				)

				res.cookie('token', token, {
					httpOnly: true,
					secure: process.env.NODE_ENV === 'production',
					sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
					maxAge: 7 * 24 * 60 * 60 * 1000,
				})

				const userData = {
					_id: user._id,
					name: user.name,
					email: user.email,
					image: user.image,
					role: user.role,
					skills: user.skills || [],
					bio: user.bio || '',
					isBlocked: user.isBlocked,
				}

				return res.status(200).json({
					success: true,
					message: 'Login successful!',
					user: userData,
				})
			} catch (error) {
				console.error('Login Error:', error)
				return res
					.status(500)
					.json({ success: false, message: 'Internal server error.' })
			}
		})

		// -------------------------------------------------------------------------
		// ৩. ইউজার লগআউট এপিআই (HTML এরর প্রুফ ও জেসন রেডি)
		// -------------------------------------------------------------------------
		// -------------------------------------------------------------------------
        // ৩. ইউজার লগআউট এপিআই (ম্যানুয়াল JWT + Better-Auth কুকি ক্লিয়ার মোড)
        // -------------------------------------------------------------------------
        app.post('/api/logout', async (req, res) => {
            try {
                const cookieOptions = {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                    path: '/', // 🎯 এই পাথ ব্রাউজারকে কুকি ডিলিট করতে বাধ্য করে
                };

                // ১. ম্যানুয়াল লগইনের কাস্টম টোকেন কুকি ক্লিয়ার করা
                res.clearCookie('token', cookieOptions);

                // ২. Better-Auth এর স্ট্যান্ডার্ড সেশন টোকেন কুকি ক্লিয়ার করা
                res.clearCookie('better-auth.session-token', cookieOptions);
                
                // ৩. Better-Auth এর সিকিউর প্রোডাকশন কুকি ক্লিয়ার করা (যদি থাকে)
                res.clearCookie('__Secure-better-auth.session-token', cookieOptions);

                // 🎯 পিওর জেসন রেসপন্স যাতে ফ্রন্টএন্ডের ফেচ গার্ড ব্রেক না করে
                return res.status(200).json({
                    success: true,
                    message: 'Logged out successfully from all sessions!',
                });
            } catch (error) {
                console.error('Logout Core Crash Log:', error);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Internal server error during logout.' 
                });
            }
        });
        
        // app.post('/api/logout', async (req, res) => {
		// 	try {
		// 		// লগইন করার সময় যে যে অপশন দিয়ে কুকি সেট করা হয়েছিল, ঠিক সেই অপশন দিয়েই ক্লিয়ার করতে হবে
		// 		res.clearCookie('token', {
		// 			httpOnly: true,
		// 			secure: process.env.NODE_ENV === 'production',
		// 			sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
		// 			path: '/', // 🎯 পাথ সুনির্দিষ্ট করে দিলে ব্রাউজার কুকি ডিলিট করতে বাধ্য হয়
		// 		})

		// 		// 🎯 মোস্ট ক্রিপ্টিক ফিক্স: কোনো টেক্সট বা এইচটিএমএল না, ডিরেক্ট জেসন অবজেক্ট রিটার্ন
		// 		return res.status(200).json({
		// 			success: true,
		// 			message: 'Logged out successfully!',
		// 		})
		// 	} catch (error) {
		// 		console.error('Logout Core Crash Log:', error)
		// 		return res
		// 			.status(500)
		// 			.json({ success: false, message: 'Internal server error.' })
		// 	}
		// })

		// -------------------------------------------------------------------------
		// ৪. নতুন টাস্ক বা জব পোস্ট করার এপিআই (AUTH FIXED)
		// -------------------------------------------------------------------------
		app.post('/api/tasks', verifyToken, async (req, res) => {
			// 🎯 ফিক্স: verifyToken যোগ করা হয়েছে
			try {
				if (!req.user || req.user.role !== 'client') {
					return res.status(403).json({
						success: false,
						message: 'Forbidden. Only active clients can post tasks.',
					})
				}

				const { title, category, description, budget, deadline } = req.body

				if (!title || !category || !description || !budget || !deadline) {
					return res.status(400).json({
						success: false,
						message: 'All required fields must be provided.',
					})
				}

				const newTask = {
					title: title.trim(),
					category: category.trim(),
					description: description.trim(),
					budget: parseFloat(budget),
					deadline: new Date(deadline),
					client_email: req.user.email,
					status: 'open',
					deliverable_url: '',
					createdAt: new Date(),
				}

				const result = await tasksCollection.insertOne(newTask)
				return res.status(201).json({
					success: true,
					message: 'Task posted successfully!',
					taskId: result.insertedId,
				})
			} catch (error) {
				console.error('Task Post Error:', error)
				return res
					.status(500)
					.json({ success: false, message: 'Internal server error.' })
			}
		})

		// -------------------------------------------------------------------------
		// ৫. Browse Tasks API: Pagination + Search + Category (verifyToken সরানো হয়েছে)
		// -------------------------------------------------------------------------
		app.get('/api/tasks', async (req, res) => {
			// 🎯 ফিক্স: এখান থেকে verifyToken সরিয়ে দেওয়া হলো
			try {
				const page = parseInt(req.query.page) || 1
				const limit = parseInt(req.query.limit) || 9
				const search = req.query.search || ''
				const category = req.query.category || ''

				const skip = (page - 1) * limit

				let query = {}

				// 🔐 নোট: যেহেতু টোকেন চেক তুলে দিয়েছি, তাই সাধারণ ভিজিটরদের জন্য শুধু "open" টাস্কগুলোই দেখাবে
				query.status = 'open'

				if (search) {
					query.title = { $regex: search, $options: 'i' }
				}

				if (category && category !== 'All') {
					query.category = category
				}

				const totalTasks = await tasksCollection.countDocuments(query)
				const tasks = await tasksCollection
					.find(query)
					.sort({ createdAt: -1 })
					.skip(skip)
					.limit(limit)
					.toArray()

				return res.status(200).json({
					success: true,
					totalTasks,
					totalPages: Math.ceil(totalTasks / limit),
					currentPage: page,
					data: tasks,
				})
			} catch (error) {
				console.error('Get Tasks Pagination Error:', error)
				return res
					.status(500)
					.json({ success: false, message: 'Internal server error.' })
			}
		})
// ৫.১. গ্লোবাল ফ্রিল্যান্সার তালিকা গেট করার এপিআই
// -------------------------------------------------------------------------
app.get('/api/freelancers', async (req, res) => {
    try {
        const { page = 1, limit = 6, search = '', category = '' } = req.query
        const query = { role: 'freelancer', isBlocked: false }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
            ]
        }

        // 🎯 ফিক্সড ক্যাটাগরি ম্যাপিং: ডেভেলপমেন্ট বা ডিজাইন সিলেক্ট করলে যেন রিলেটেড স্কিলগুলো খুঁজে পায়
        if (category && category !== 'All') {
            if (category.toLowerCase() === 'development') {
                query.skills = { $in: [/react/i, /next\.js/i, /node\.js/i, /python/i, /django/i, /javascript/i, /php/i, /wordpress/i] }
            } else if (category.toLowerCase() === 'design') {
                query.skills = { $in: [/figma/i, /ui\/ux/i, /adobe/i] }
            } else if (category.toLowerCase() === 'marketing') {
                query.skills = { $in: [/seo/i, /marketing/i, /content/i] }
            } else {
                query.skills = { $in: [new RegExp(category, 'i')] }
            }
        }

        const pageNumber = parseInt(page)
        const limitNumber = parseInt(limit)
        const skip = (pageNumber - 1) * limitNumber

        const totalCount = await usersCollection.countDocuments(query)
        const freelancers = await usersCollection
            .find(query)
            .project({ password: 0 })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNumber)
            .toArray()

        return res.status(200).json({
            success: true,
            data: freelancers,
            meta: {
                totalCount,
                totalPages: Math.ceil(totalCount / limitNumber),
                currentPage: pageNumber,
                limit: limitNumber,
            },
        })
    } catch (error) {
        console.error('Get Freelancers Error:', error)
        return res
            .status(500)
            .json({ success: false, message: 'Internal server error.' })
    }
})
// 🎯 ৫.২. নির্দিষ্ট আইডি দিয়ে সিঙ্গেল ফ্রিল্যান্সার প্রোফাইল গেট করার এপিআই
// -------------------------------------------------------------------------
app.get('/api/freelancers/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // মঙ্গোডিবি আইডি ভ্যালিড কি না চেক করা
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid freelancer ID format.' });
        }

        // আইডির মাধ্যমে নির্দিষ্ট ফ্রিল্যান্সার খোঁজা
        const freelancer = await usersCollection.findOne(
            { _id: new ObjectId(id), role: 'freelancer' },
            { projection: { password: 0 } } // পাসওয়ার্ড সিকিউর রাখা
        );

        if (!freelancer) {
            return res.status(404).json({ success: false, message: 'Freelancer not found.' });
        }

        return res.status(200).json({
            success: true,
            data: freelancer
        });
    } catch (error) {
        console.error('Get Single Freelancer Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});
	
		// -------------------------------------------------------------------------
		// ৫.২. হোম পেজের ডাইনামিক ডাটা গেট করার এপিআই
		// -------------------------------------------------------------------------
	app.get('/api/home-data', async (req, res) => {
    try {
        const latestTasks = await tasksCollection
            .find({ status: 'open' })
            .sort({ createdAt: -1 })
            .limit(9)
            .toArray()

        // 🎯 একদম সহজ সমাধান: যাদের রেটিং ফিল্ড আছে তাদের মধ্য থেকে টপ ৩ জনকে আনবে
        const topFreelancers = await usersCollection
            .find({ 
                role: 'freelancer', 
                isBlocked: false,
                averageRating: { $exists: true } // 👈 শুধু যাদের রেটিং ডাটা আছে তাদের ফিল্টার করবে
            })
            .sort({ averageRating: -1, ratingCount: -1 })
            .limit(3)
            .project({ password: 0 })
            .toArray()

        // 💡 যদি নতুন ডাটাবেজ হয় আর কারো রেটিং না থাকে, তবে যেন খালি না দেখিয়ে যেকোনো ৩ জন ফ্রিল্যান্সারকে দেখায়
        if (topFreelancers.length === 0) {
            const fallbackFreelancers = await usersCollection
                .find({ role: 'freelancer', isBlocked: false })
                .limit(3)
                .project({ password: 0 })
                .toArray();
                
            return res.status(200).json({
                success: true,
                tasks: latestTasks,
                freelancers: fallbackFreelancers,
            });
        }

        return res.status(200).json({
            success: true,
            tasks: latestTasks,
            freelancers: topFreelancers,
        })
    } catch (error) {
        console.error('Home Data API Error:', error)
        return res
            .status(500)
            .json({ success: false, message: 'Internal server error.' })
    }
})


		// -------------------------------------------------------------------------
		// 🎯 ৫.২.১ আলটিমেট রেটিং এপিআই: আলাদা কালেকশন (reviews) তৈরি ও ইউজার আপডেট
		// -------------------------------------------------------------------------
		app.post('/api/reviews', async (req, res) => {
    try {
        const { task_id, reviewer_email, reviewee_email, rating, comment } = req.body;

        if (!reviewee_email || !rating) {
            return res.status(400).json({
                success: false,
                message: 'Reviewee email and rating value are required.',
            });
        }

        const parsedRating = parseFloat(rating); // 🎯 রেটিংকে একবারে ফ্লোট করে নেওয়া হলো সেফটির জন্য

        // ১. 'reviews' কালেকশনে নতুন ডকুমেন্ট ইনসার্ট করা
        const reviewDoc = {
            task_id: task_id || '',
            reviewer_email: reviewer_email || '',
            reviewee_email: reviewee_email.trim(),
            rating: parsedRating,
            comment: comment || '',
            created_at: new Date(),
        };
        const reviewResult = await reviewsCollection.insertOne(reviewDoc);

        // ২. ফ্রিল্যান্সার ইউজারের প্রোফাইল খুঁজে বের করে গড় রেটিং আপডেট করা
        const query = {
            email: { $regex: `^${reviewee_email.trim()}$`, $options: 'i' },
        };
        const freelancer = await usersCollection.findOne(query);

        if (freelancer) {
            const oldTotal = parseFloat(freelancer.totalRating || 0); // 🎯 সেফটি ফ্লোট পার্স
            const oldCount = parseInt(freelancer.ratingCount || 0);

            const currentTotal = oldTotal + parsedRating; // 🎯 আগের ভুলের ফিক্সড
            const currentCount = oldCount + 1;
            const currentAverage = parseFloat((currentTotal / currentCount).toFixed(1));

            await usersCollection.updateOne(
                { _id: freelancer._id },
                {
                    $set: {
                        totalRating: currentTotal,
                        ratingCount: currentCount,
                        averageRating: currentAverage,
                    },
                },
            );
            console.log(`💾 [Synced] History logged & profile updated for ${reviewee_email}`);
        }

        return res.status(201).json({
            success: true,
            message: 'Review Core Logged & Collection Updated Successfully!',
            reviewId: reviewResult.insertedId,
        });
    } catch (error) {
        console.error('Reviews Matrix Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});
		// -------------------------------------------------------------------------
		// ৫.৩. লগইন করা ফ্রিল্যান্সারের নিজস্ব প্রোপোজাল তালিকা (ডুপ্লিকেট রিমুভড ও ফিক্সড)
		// -------------------------------------------------------------------------
		app.get('/api/freelancer/proposals', verifyToken, async (req, res) => {
			try {
				if (req.user.role !== 'freelancer') {
					return res.status(403).json({
						success: false,
						message: 'Unauthorized. Freelancer role required.',
					})
				}

				const proposals = await proposalsCollection
					.find({ freelancer_email: req.user.email })
					.sort({ submitted_at: -1 })
					.toArray()

				const taskIds = proposals.map((p) => p.task_id)
				const matchingTasks = await tasksCollection
					.find({ _id: { $in: taskIds } })
					.toArray()

				const enrichedProposals = proposals.map((proposal) => {
					const task = matchingTasks.find(
						(t) => t._id.toString() === proposal.task_id.toString(),
					)
					return {
						...proposal,
						taskTitle: task ? task.title : 'Unknown Task',
					}
				})

				return res.status(200).json({ success: true, data: enrichedProposals })
			} catch (error) {
				console.error('Get Freelancer Proposals Error:', error)
				return res
					.status(500)
					.json({ success: false, message: 'Internal server error.' })
			}
		})

		// -------------------------------------------------------------------------
		// ৬. আইডি দিয়ে নির্দিষ্ট একটি টাস্কের ডিটেইলস গেট করা
		// -------------------------------------------------------------------------
		app.get('/api/tasks/:id', async (req, res) => {
			try {
				const id = req.params.id
				const query = { _id: new ObjectId(id) }
				const task = await tasksCollection.findOne(query)

				if (!task) {
					return res
						.status(404)
						.json({ success: false, message: 'Task not found.' })
				}

				return res.status(200).json({ success: true, data: task })
			} catch (error) {
				console.error('Get Task Details Error:', error)
				return res
					.status(500)
					.json({ success: false, message: 'Internal server error.' })
			}
		})

		// -------------------------------------------------------------------------
		// ७. ফ্রিল্যান্সারদের প্রোপোজাল বা বিড সাবমিট করার API
		// -----------------------------------------------------------------------------
      // -------------------------------------------------------------------------
        // 🎯 ফ্রিল্যান্সারের প্রোপোজাল সাবমিট করার API (ওপেন মোড - নো ভেরিফাই টোকেন)
        // -------------------------------------------------------------------------
        app.post('/api/proposals', async (req, res) => {
            try {
                // ফ্রন্টএন্ড থেকে পাঠানো ডাটা সরাসরি রিসিভ করা হচ্ছে
                const { task_id, freelancer_email, proposed_budget, estimated_days, cover_note } = req.body;

                if (!task_id || !freelancer_email || !proposed_budget || !estimated_days || !cover_note) {
                    return res.status(400).json({ 
                        success: false, 
                        message: 'Missing required fields.' 
                    });
                }

                const newProposal = {
                    task_id: task_id,
                    freelancer_email: freelancer_email.trim(), // ফ্রন্টএন্ডের পাঠানো ইমেইল বসে যাবে
                    proposed_budget: Number(proposed_budget),
                    estimated_days: Number(estimated_days),
                    cover_note: cover_note.trim(),
                    status: 'pending',
                    submitted_at: new Date()
                };

                // ডাটাবেজে ইনসার্ট
                const result = await proposalsCollection.insertOne(newProposal);

                // কাউন্টার আপডেট লজিক
                if (result.insertedId) {
                    const { ObjectId } = require('mongodb');
                    try {
                        await tasksCollection.updateOne(
                            { _id: new ObjectId(task_id) },
                            { $inc: { proposalsCount: 1 } }
                        );
                    } catch (taskErr) {
                        console.error("Counter increment failed:", taskErr);
                    }
                }

                return res.status(201).json({
                    success: true,
                    message: 'Proposal submitted successfully!',
                    data: result
                });

            } catch (error) {
                console.error('Open Proposal Submit Error:', error);
                return res.status(500).json({ success: false, message: 'Internal server error.' });
            }
        });

		// -------------------------------------------------------------------------
		// -------------------------------------------------------------------------
        // -------------------------------------------------------------------------
       // ৮. নির্দিষ্ট ক্লায়েন্টের টাস্কগুলোর বিপরীতে আসা প্রোপোজাল গেট করা (ওপেন মোড)
// -------------------------------------------------------------------------
app.get('/api/client/proposals', async (req, res) => {
    try {
        // 🎯 ফ্রন্টএন্ডের সাথে মিল রেখে client_email কুয়েরি প্যারামিটার থেকে নেওয়া হচ্ছে
        const clientEmail = req.query.client_email; 

        if (!clientEmail) {
            return res.status(400).json({ success: false, message: 'Client email query parameter is required.' });
        }

        // ১. এই ক্লায়েন্টের পোস্ট করা সব টাস্ক খুঁজে বের করা
        const clientTasks = await tasksCollection
            .find({ client_email: clientEmail.trim() })
            .toArray();

        // ক্লায়েন্টের কোনো টাস্ক না থাকলে খালি অ্যারে ব্যাক করা
        if (!clientTasks || clientTasks.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        // ২. টাস্ক আইডিগুলোর অ্যারে তৈরি (ObjectId এবং String দুই ফরম্যাটেই সেফটি গার্ড)
        const taskIds = clientTasks.map((task) => task._id);
        const stringTaskIds = clientTasks.map((task) => task._id.toString());

        // ৩. প্রপোজাল কালেকশন থেকে ওই টাস্কগুলোর সব প্রপোজাল খুঁজে বের করা
        const proposals = await proposalsCollection
            .find({ 
                $or: [
                    { task_id: { $in: taskIds } },
                    { task_id: { $in: stringTaskIds } }
                ]
            })
            .sort({ submitted_at: -1 })
            .toArray();

        // ৪. ডাটা এনরিচমেন্ট (টাস্ক টাইটেল ম্যাপ করা)
        const enrichedProposals = proposals.map((proposal) => {
            const matchingTask = clientTasks.find(
                (t) => t._id.toString() === proposal.task_id?.toString(),
            );
            return {
                ...proposal,
                taskTitle: matchingTask ? matchingTask.title : 'Unknown Task',
            };
        });

        // ফ্রন্টএন্ডে ডাটা সাকসেসফুলি পাঠানো
        return res.status(200).json({ success: true, data: enrichedProposals });
        
    } catch (error) {
        console.error('Get Client Proposals Open Route Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});



		// =========================================================================
		// 🎯 SECTION 09: COMPLETE SUPREME ADMIN CORE MODULE
		// =========================================================================

		// 🔐 ১. সিঙ্কড লগইন এপিআই (লকাল স্টোরেজ ও রোল জ্যাম ফিক্স করার জন্য)
		// তোমার ওরিজিনাল লগইন রাউটের লজিকটা ঠিক এই স্ট্রাকচারে ম্যাচ করে নিও ভাই
		app.post('/api/login', async (req, res) => {
			try {
				const { email, password } = req.body

				// ডাটাবেজ থেকে ইউজার খোঁজা
				const user = await usersCollection.findOne({ email })
				if (!user) {
					return res
						.status(404)
						.json({ success: false, message: 'User not found!' })
				}

				// ইউজার ব্লকড কি না চেক (রিকোয়ারমেন্ট অনুযায়ী)
				if (user.isBlocked) {
					return res.status(403).json({
						success: false,
						message:
							'Access Denied: This account has been blocked by the Supreme Admin!',
					})
				}

				// ⚠️ নোট: তোমার প্রজেক্টের রিয়েল পাসওয়ার্ড ভ্যালিডেশন (bcrypt/plain text) এখানে বসাবে ভাই
				// উদাহরণস্বরূপ প্লেন টেক্সট চেক ধরলে:
				const isPasswordValid = password === user.password

				if (!isPasswordValid) {
					return res
						.status(401)
						.json({ success: false, message: 'Invalid credentials!' })
				}

				// 🎯 মোস্ট ইম্পর্ট্যান্ট রেসপন্স: যা লোকাল স্টোরেজের লক ছুটোবে
				return res.status(200).json({
					success: true,
					message: 'Login successful',
					user: {
						_id: user._id,
						name: user.name,
						email: user.email,
						role: user.role, // 🚀 ডাটাবেজের ফ্রেশ "admin", "client" বা "freelancer" পাস হচ্ছে
						isBlocked: user.isBlocked || false,
					},
				})
			} catch (error) {
				return res.status(500).json({ success: false, message: error.message })
			}
		})

		// 📊 ২. ওভারভিউ স্ট্যাটিস্টিকস এপিআই
		// Route: GET /api/admin/stats
		app.get('/api/admin/stats', async (req, res) => {
			try {
				const totalUsers = await usersCollection.countDocuments()
				const totalTasks = await tasksCollection.countDocuments()

				// ট্রানজেকশন কালেকশন (payments) থেকে মোট রেভিনিউ হিসাব করা
				const payments = await paymentsCollection.find().toArray()
				const totalRevenue = payments.reduce(
					(sum, p) => sum + parseFloat(p.amount || 0),
					0,
				)

				return res.status(200).json({
					success: true,
					stats: {
						totalUsers,
						totalTasks,
						totalRevenue: parseFloat(totalRevenue.toFixed(2)), // ২ ডেসিমেলে ফিক্সড রেভিনিউ
					},
				})
			} catch (error) {
				return res.status(500).json({ success: false, message: error.message })
			}
		})

		// 👥 ৩. ইউজার ম্যানেজমেন্ট: ব্লক/আনব্লক এপিআই
		// Route: PATCH /api/admin/users/:id/block
		app.patch('/api/admin/users/:id/block', async (req, res) => {
			try {
				const { id } = req.params
				const { blockStatus } = req.body // ফ্রন্টএন্ড থেকে true বা false আসবে

				const result = await usersCollection.updateOne(
					{ _id: new ObjectId(id) },
					{ $set: { isBlocked: blockStatus } },
				)

				if (result.matchedCount === 0) {
					return res
						.status(404)
						.json({ success: false, message: 'User node not found!' })
				}

				return res.status(200).json({
					success: true,
					message: blockStatus
						? 'User successfully blocked.'
						: 'User successfully reactivated.',
				})
			} catch (error) {
				return res.status(500).json({ success: false, message: error.message })
			}
		})

		// 📝 ৪. টাস্ক ম্যানেজমেন্ট: গাইডলাইন ভায়োলেশনের জন্য টাস্ক ডিলিট এপিআই
		// Route: DELETE /api/admin/tasks/:id
		app.delete('/api/admin/tasks/:id', async (req, res) => {
			try {
				const { id } = req.params

				const result = await tasksCollection.deleteOne({
					_id: new ObjectId(id),
				})

				if (result.deletedCount === 0) {
					return res.status(404).json({
						success: false,
						message: 'Task row not found or already purged!',
					})
				}

				return res.status(200).json({
					success: true,
					message:
						'Task row successfully purged from platform due to safety guidelines violation.',
				})
			} catch (error) {
				return res.status(500).json({ success: false, message: error.message })
			}
		})

		// 💳 ৫. ট্রানজেকশন হিস্ট্রি এপিআই (Stripe Matrix Assets View)
		// Route: GET /api/admin/transactions
		app.get('/api/admin/transactions', async (req, res) => {
			try {
				// পেমেন্ট কালেকশন থেকে সাম্প্রতিক সব পেমেন্ট হিস্ট্রি অবজেক্ট নিয়ে আসা
				const transactions = await paymentsCollection
					.find()
					.sort({ created_at: -1 })
					.toArray()

				return res.status(200).json({
					success: true,
					transactions: transactions || [],
				})
			} catch (error) {
				return res.status(500).json({ success: false, message: error.message })
			}
		})

		// -------------------------------------------------------------------------
		// ৯. প্রোপোজাল এক্সেপ্ট করার API (Status Update)
		// -------------------------------------------------------------------------
		app.patch('/api/proposals/:id/accept', verifyToken, async (req, res) => {
			try {
				if (req.user.role !== 'client') {
					return res
						.status(403)
						.json({ success: false, message: 'Unauthorized.' })
				}

				const proposalId = req.params.id
				const proposalUpdate = await proposalsCollection.updateOne(
					{ _id: new ObjectId(proposalId) },
					{ $set: { status: 'accepted' } },
				)

				if (proposalUpdate.modifiedCount === 0) {
					return res.status(404).json({
						success: false,
						message: 'Proposal not found or already accepted.',
					})
				}

				const proposal = await proposalsCollection.findOne({
					_id: new ObjectId(proposalId),
				})
				if (proposal) {
					await tasksCollection.updateOne(
						{ _id: proposal.task_id },
						{ $set: { status: 'ongoing' } },
					)
				}

				return res
					.status(200)
					.json({ success: true, message: 'Proposal accepted successfully!' })
			} catch (error) {
				console.error('Accept Proposal Error:', error)
				return res
					.status(500)
					.json({ success: false, message: 'Internal server error.' })
			}
		})

		// -------------------------------------------------------------------------
		// ১০.১. স্ট্রাইপ চেকআউট সেশন তৈরি করার API
		// -------------------------------------------------------------------------
		app.post('/api/create-checkout-session', async (req, res) => {
			try {
				const { proposalId, taskTitle, amount } = req.body
				const finalAmount = parseFloat(amount)
				const finalTitle = taskTitle || 'SkillSwap Venture Milestone Deployment'

				if (!finalAmount || finalAmount <= 0) {
					return res.status(400).json({
						success: false,
						message:
							'Backend Rejected: Missing required checkout parameters or invalid amount size.',
					})
				}

				const session = await stripe.checkout.sessions.create({
					payment_method_types: ['card'],
					line_items: [
						{
							price_data: {
								currency: 'usd',
								product_data: {
									name: finalTitle,
									description: `Escrow Secure Payment Ledger Node for Proposal: ${proposalId || 'Core Vector'}`,
								},
								unit_amount: Math.round(finalAmount * 100),
							},
							quantity: 1,
						},
					],
					mode: 'payment',
					success_url: `http://localhost:3000/payment/success?session_id={CHECKOUT_SESSION_ID}&proposalId=${proposalId}`,
					cancel_url: `http://localhost:3000/dashboard/client`,
				})

				return res.status(200).json({ success: true, url: session.url })
			} catch (err) {
				console.error('Stripe Session Creation Crash Log:', err.message)
				return res.status(500).json({ success: false, message: err.message })
			}
		})

		// -------------------------------------------------------------------------
		// ১০.২. ডাবল-চেক ট্রানজেকশন ও ডাটাবেজ আপডেট API (/api/confirm-session)
		// -------------------------------------------------------------------------
		app.post('/api/confirm-session', verifyToken, async (req, res) => {
			try {
				const { sessionId, proposalId } = req.body

				if (!sessionId || !proposalId) {
					return res
						.status(400)
						.json({ success: false, message: 'Missing required parameters.' })
				}

				const session = await stripe.checkout.sessions.retrieve(sessionId)
				if (session.payment_status !== 'paid') {
					return res.status(400).json({
						success: false,
						message: 'Transaction verification failed.',
					})
				}

				let queryId
				try {
					queryId = new ObjectId(proposalId)
				} catch (e) {
					return res
						.status(400)
						.json({ success: false, message: 'Invalid Proposal ID format.' })
				}

				const proposal = await proposalsCollection.findOne({ _id: queryId })
				if (!proposal) {
					return res
						.status(404)
						.json({ success: false, message: 'Proposal record not found.' })
				}

				await proposalsCollection.updateOne(
					{ _id: queryId },
					{ $set: { status: 'accepted' } },
				)

				let taskQueryId
				try {
					taskQueryId = new ObjectId(proposal.taskId || proposal.task_id)
					await tasksCollection.updateOne(
						{ _id: taskQueryId },
						{
							$set: {
								status: 'ongoing',
								hired_freelancer: proposal.freelancer_email,
							},
						},
					)
				} catch (taskErr) {
					await tasksCollection.updateOne(
						{ _id: proposal.taskId || proposal.task_id },
						{
							$set: {
								status: 'ongoing',
								hired_freelancer: proposal.freelancer_email,
							},
						},
					)
				}

				return res.status(200).json({
					success: true,
					message: 'Transaction secured and verified successfully.',
					data: {
						taskTitle:
							proposal.taskTitle || proposal.title || 'Marketplace Task',
						freelancerName: proposal.freelancer_name || 'Verified Expert',
						amount: session.amount_total / 100,
					},
				})
			} catch (error) {
				console.error('Confirm Session Major Error:', error)
				return res
					.status(500)
					.json({ success: false, message: 'Verification processing crash.' })
			}
		})

		// 🎯 ব্যাকএন্ডে সব ইউজারের ডাটা সাপ্লাই করার এপিআই রাউট
		app.get('/api/users', async (req, res) => {
			try {
				// ডাটাবেজের usersCollection থেকে সব ইউজার তুলে আনা
				const users = await usersCollection.find().toArray()
				return res.status(200).json({ success: true, data: users || [] })
			} catch (error) {
				return res.status(500).json({ success: false, message: error.message })
			}
		})

		// -------------------------------------------------------------------------
		// ১১. ইউজার প্রোফাইল আপডেট করার এপিআই
		// -------------------------------------------------------------------------
		app.patch('/api/users/profile', verifyToken, async (req, res) => {
			try {
				const { bio, skills, hourly_rate } = req.body
				const userEmail = req.user.email

				const updateDoc = {
					$set: {
						bio: bio ? bio.trim() : '',
						skills: skills
							? skills
									.split(',')
									.map((s) => s.trim())
									.filter(Boolean)
							: [],
						hourly_rate: parseFloat(hourly_rate) || 0,
					},
				}

				const result = await usersCollection.updateOne(
					{ email: userEmail },
					updateDoc,
				)

				if (result.matchedCount === 0) {
					return res
						.status(404)
						.json({ success: false, message: 'User profile not found.' })
				}

				const updatedUser = await usersCollection.findOne(
					{ email: userEmail },
					{ projection: { password: 0 } },
				)

				return res.status(200).json({
					success: true,
					message: 'Profile updated successfully!',
					user: updatedUser,
				})
			} catch (error) {
				console.error('Profile Update Error:', error)
				return res
					.status(500)
					.json({ success: false, message: 'Internal server error.' })
			}
		})

		// -------------------------------------------------------------------------
		// ১২. পেমেন্ট ডাটা কালেকশনে সেভ করার এন্ডপয়েন্ট
		// -------------------------------------------------------------------------
		app.post('/api/payments', async (req, res) => {
			try {
				const {
					client_email,
					freelancer_email,
					task_id,
					amount,
					transaction_id,
				} = req.body

				const paymentDoc = {
					client_email,
					freelancer_email,
					task_id,
					amount: parseFloat(amount),
					transaction_id,
					payment_status: 'succeeded',
					paid_at: new Date(),
				}

				const result = await paymentsCollection.insertOne(paymentDoc)
				return res
					.status(201)
					.json({ success: true, message: 'Payment Vector Saved', result })
			} catch (err) {
				return res.status(500).json({ success: false, message: err.message })
			}
		})

		// -------------------------------------------------------------------------
		// ১৩. রিভিউ এবং রেটিং কালেকশনে সেভ করার এন্ডপয়েন্ট
		// -------------------------------------------------------------------------
		app.post('/api/reviews', async (req, res) => {
			try {
				const { task_id, reviewer_email, reviewee_email, rating, comment } =
					req.body

				const reviewDoc = {
					task_id,
					reviewer_email,
					reviewee_email,
					rating: parseFloat(rating),
					comment,
					created_at: new Date(),
				}

				const result = await reviewsCollection.insertOne(reviewDoc)
				return res
					.status(201)
					.json({ success: true, message: 'Review Core Logged', result })
			} catch (err) {
				return res.status(500).json({ success: false, message: err.message })
			}
		})

		const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // আপনার স্ট্রাইপ সিক্রেট কি

// স্ট্রাইপ সেশন ভেরিফিকেশন রুট
app.post('/api/verify-payment', async (req, res) => {
    try {
        const { sessionId, proposalId } = req.body;

        // ১. সেফটি গার্ড: রিকোয়েস্ট বডিতে প্রয়োজনীয় আইডি আছে কিনা চেক
        if (!sessionId || !proposalId) {
            return res.status(400).json({ 
                success: false, 
                message: "Missing sessionId or proposalId in request body." 
            });
        }

        // ২. স্ট্রাইপ থেকে সেশন ডিটেইলস রিট্রাইভ (Retrieve) করা
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        // ৩. পемেন্ট স্ট্যাটাস চেক করা (Paid কিনা)
        if (session.payment_status !== 'paid') {
            return res.status(400).json({ 
                success: false, 
                message: "Payment has not been completed yet." 
            });
        }

        // ৪. প্রোপোজাল কালেকশন থেকে ডাটা নিয়ে আসা (ডাটা এনরিচমেন্টের জন্য)
        // (এখানে আপনার ডিক্লেয়ার করা proposalsCollection এবং tasksCollection এর রেফারেন্স ব্যবহার করবেন)
        const proposal = await proposalsCollection.findOne({ _id: new ObjectId(proposalId) });
        
        if (!proposal) {
            return res.status(404).json({ 
                success: false, 
                message: "Associated proposal node not found." 
            });
        }

        // ৫. ফ্রন্টএন্ডে পাঠানোর জন্য ডাটা অবজেক্ট তৈরি
        const verifiedData = {
            id: session.id,
            amount: session.amount_total / 100, // স্ট্রাইপ অ্যামাউন্ট সেন্টে (cents) রাখে, তাই ১০০ দিয়ে ভাগ করে ডলারে নেওয়া হলো
            currency: session.currency,
            clientEmail: session.customer_details?.email || proposal.client_email,
            freelancerEmail: proposal.freelancer_email,
            freelancerName: proposal.freelancer_name || "Verified Expert",
            taskId: proposal.task_id,
            taskTitle: proposal.taskTitle || "SkillSwap Project Assignment"
        };

        // ৬. ফ্রন্টএন্ডে সাকসেস রেসপন্স পাঠানো
        return res.status(200).json({ 
            success: true, 
            message: "Stripe payment successfully verified.", 
            data: verifiedData 
        });

    } catch (error) {
        console.error("Stripe Verification Route Error:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Internal server error during payment verification." 
        });
    }
});


// app.all("/api/auth/*", (req, res) => {
//             if (!auth) {
//                 return res.status(500).json({ success: false, message: "Auth system not initialized yet." });
//             }
//             return auth.handler(req, res);
//         });
		await client.db("admin").command({ ping: 1 });
		console.log(
			'Pinged your deployment. You successfully connected to MongoDB!',
		)
	} finally {
		// Connection open থাকবে
	}
}

run().catch(console.dir)

app.get('/', (req, res) => {
	res.send('Server is running fine!')
})

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`)
})
