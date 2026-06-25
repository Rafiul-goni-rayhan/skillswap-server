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

// CORS কনফিগারেশন
app.use(
	cors({
		credentials: true,
		origin: [process.env.CLIENT_URL || 'http://localhost:3000'],
	}),
)
app.use(express.json())
app.use(cookieParser())

// -------------------------------------------------------------------------
// 🛡️ ব্যাকএন্ড ভেরিফিকেশন মিডলওয়্যার (Challenge 2: JWT Verification)
// -------------------------------------------------------------------------
const verifyToken = (req, res, next) => {
	const token = req.cookies?.token

	if (!token) {
		return res
			.status(401)
			.json({ success: false, message: 'Unauthorized access. Token missing.' })
	}

	jwt.verify(
		token,
		process.env.JWT_SECRET || 'super-secret-key',
		(err, decoded) => {
			if (err) {
				return res.status(403).json({
					success: false,
					message: 'Forbidden access. Invalid or expired token.',
				})
			}

			req.user = decoded // টোকেন ঠিক থাকলে ইউজারের ডাটা সেট করা
			next()
		},
	)
}

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

		// -------------------------------------------------------------------------
		// ১. ইউজার রেজিস্ট্রেশন এপিআই
		// -------------------------------------------------------------------------
		app.post('/api/register', async (req, res) => {
			try {
				const { name, email, image, password, role } = req.body

				if (!name || !email || !image || !password) {
					return res.status(400).json({
						success: false,
						message: 'All fields (Name, Email, Image, Password) are required.',
					})
				}

				const existingUser = await usersCollection.findOne({
					email: email.trim(),
				})
				if (existingUser) {
					return res.status(400).json({
						success: false,
						message: 'User already exists with this email.',
					})
				}

				// // পাসওয়ার্ড পলিসি ভ্যালিডーション
				// if (password.length < 6) {
				// 	return res.status(400).json({
				// 		success: false,
				// 		message: 'Password must be at least 6 characters long.',
				// 	})
				// }
				// if (!/[A-Z]/.test(password)) {
				// 	return res.status(400).json({
				// 		success: false,
				// 		message: 'Password must contain at least one capital letter.',
				// 	})
				// }
				// if (!/[a-z]/.test(password)) {
				// 	return res.status(400).json({
				// 		success: false,
				// 		message: 'Password must contain at least one lowercase letter.',
				// 	})
				// }

				const newUser = {
					name: name.trim(),
					email: email.trim(),
					image: image.trim(),
					password: password.trim(),
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
		app.post('/api/logout', async (req, res) => {
			try {
				// লগইন করার সময় যে যে অপশন দিয়ে কুকি সেট করা হয়েছিল, ঠিক সেই অপশন দিয়েই ক্লিয়ার করতে হবে
				res.clearCookie('token', {
					httpOnly: true,
					secure: process.env.NODE_ENV === 'production',
					sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
					path: '/', // 🎯 পাথ সুনির্দিষ্ট করে দিলে ব্রাউজার কুকি ডিলিট করতে বাধ্য হয়
				})

				// 🎯 মোস্ট ক্রিপ্টিক ফিক্স: কোনো টেক্সট বা এইচটিএমএল না, ডিরেক্ট জেসন অবজেক্ট রিটার্ন
				return res.status(200).json({
					success: true,
					message: 'Logged out successfully!',
				})
			} catch (error) {
				console.error('Logout Core Crash Log:', error)
				return res
					.status(500)
					.json({ success: false, message: 'Internal server error.' })
			}
		})

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

		// -------------------------------------------------------------------------
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

				if (category && category !== 'All') {
					query.skills = { $in: [new RegExp(category, 'i')] }
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

				const topFreelancers = await usersCollection
					.find({ role: 'freelancer', isBlocked: false })
					.sort({ averageRating: -1, ratingCount: -1 })
					.limit(3)
					.project({ password: 0 })
					.toArray()

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
				const { task_id, reviewer_email, reviewee_email, rating, comment } =
					req.body

				if (!reviewee_email || !rating) {
					return res.status(400).json({
						success: false,
						message: 'Reviewee email and rating value are required.',
					})
				}

				// ১. 'reviews' কালেকশনে নতুন ডকুমেন্ট বা ব্লক ইনসার্ট করা (এর ফলে কম্পাসে আলাদা ফোল্ডার তৈরি হবে)
				const reviewDoc = {
					task_id: task_id || '',
					reviewer_email: reviewer_email || '',
					reviewee_email: reviewee_email.trim(),
					rating: parseFloat(rating),
					comment: comment || '',
					created_at: new Date(),
				}
				const reviewResult = await reviewsCollection.insertOne(reviewDoc)

				// ২. এবার ফ্রিল্যান্সার ইউজারের প্রোফাইল খুঁজে বের করে গড় রেটিং আপডেট করা
				const query = {
					email: { $regex: `^${reviewee_email.trim()}$`, $options: 'i' },
				}
				const freelancer = await usersCollection.findOne(query)

				if (freelancer) {
					const oldTotal = freelancer.totalRating || 0
					const { ratingCount: oldCount = 0 } = freelancer

					const currentTotal = oldTotal + parseInt(rating)
					const currentCount = oldCount + 1
					const currentAverage = parseFloat(
						(currentTotal / currentCount).toFixed(1),
					)

					await usersCollection.updateOne(
						{ _id: freelancer._id },
						{
							$set: {
								totalRating: currentTotal,
								ratingCount: currentCount,
								averageRating: currentAverage,
							},
						},
					)
					console.log(
						`💾 [Collection Created & Synced] History logged in reviews & profile updated for ${reviewee_email}`,
					)
				}

				return res.status(201).json({
					success: true,
					message: 'Review Core Logged & Collection Updated Successfully!',
					reviewId: reviewResult.insertedId,
				})
			} catch (error) {
				console.error('Reviews Matrix Error:', error)
				return res.status(500).json({ success: false, message: error.message })
			}
		})

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
		// -------------------------------------------------------------------------
		app.post('/api/proposals', verifyToken, async (req, res) => {
			try {
				if (req.user.role !== 'freelancer') {
					return res.status(403).json({
						success: false,
						message: 'Only freelancers can submit proposals.',
					})
				}

				const { task_id, proposed_budget, estimated_days, cover_note } =
					req.body

				if (!task_id || !proposed_budget || !estimated_days || !cover_note) {
					return res
						.status(400)
						.json({ success: false, message: 'All fields are required.' })
				}

				const existingProposal = await proposalsCollection.findOne({
					task_id: new ObjectId(task_id),
					freelancer_email: req.user.email,
				})

				if (existingProposal) {
					return res.status(400).json({
						success: false,
						message: 'You have already submitted a proposal for this task.',
					})
				}

				const newProposal = {
					task_id: new ObjectId(task_id),
					freelancer_email: req.user.email,
					proposed_budget: parseFloat(proposed_budget),
					estimated_days: parseInt(estimated_days),
					cover_note: cover_note.trim(),
					status: 'pending',
					submitted_at: new Date(),
				}

				const result = await proposalsCollection.insertOne(newProposal)
				return res.status(201).json({
					success: true,
					message: 'Proposal submitted successfully!',
					proposalId: result.insertedId,
				})
			} catch (error) {
				console.error('Proposal Post Error:', error)
				return res
					.status(500)
					.json({ success: false, message: 'Internal server error.' })
			}
		})

		// -------------------------------------------------------------------------
		// ৮. নির্দিষ্ট ক্লায়েন্টের টাস্কগুলোর বিপরীতে আসা প্রোপোজাল গেট করা
		// -------------------------------------------------------------------------
		app.get('/api/client/proposals', verifyToken, async (req, res) => {
			try {
				if (req.user.role !== 'client') {
					return res
						.status(403)
						.json({ success: false, message: 'Unauthorized.' })
				}

				const clientTasks = await tasksCollection
					.find({ client_email: req.user.email })
					.toArray()
				const taskIds = clientTasks.map((task) => task._id)

				const proposals = await proposalsCollection
					.find({ task_id: { $in: taskIds } })
					.sort({ submitted_at: -1 })
					.toArray()

				const enrichedProposals = proposals.map((proposal) => {
					const matchingTask = clientTasks.find(
						(t) => t._id.toString() === proposal.task_id.toString(),
					)
					return {
						...proposal,
						taskTitle: matchingTask ? matchingTask.title : 'Unknown Task',
					}
				})

				return res.status(200).json({ success: true, data: enrichedProposals })
			} catch (error) {
				console.error('Get Client Proposals Error:', error)
				return res
					.status(500)
					.json({ success: false, message: 'Internal server error.' })
			}
		})

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

		// await client.db("admin").command({ ping: 1 });
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
