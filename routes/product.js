const router = require('express').Router();
const db = require('../database/db');
const asyncHandler = require('express-async-handler');
const { validateProduct, validateUpdateProduct } = require('../schema/product')
const { checkTokenAndAdmin } = require('../middlewars/checktoken');
const photoUpload = require('../middlewars/photoUpload');
const path =require("path")
const {removeImage ,uploadImage}= require("../utils/cloudinary")
const fs =require("fs");
/**
 * @method GET
 * @route /api/products
 * @access public
 * @description Fetch all products
 */
router.get('/', asyncHandler(async (req, res) => {
    const sql = "SELECT p.id,p.name,p.mark,p.price,p.stock, p.category,p.image_url, ROUND(AVG(r.rating), 1) AS average_rating , COUNT(r.id) AS total_reviews FROM  products p LEFT JOIN  reviews r ON p.id = r.product_id GROUP BY  p.id, p.name, p.mark, p.price, p.stock, p.image_url;"
    const [results] = await db.query(sql);
    res.status(200).json(results);
}));

/**
 * @method GET
 * @route /api/products/category
 * @access public
 * @description fetch all product categories
 */

router.get('/category', asyncHandler(async (req, res) => {
    const sql = "SELECT DISTINCT category FROM products"
    const [results] = await db.query(sql);
    res.status(200).json(results);
}));

/**
 * @method GET
 * @route /api/products/:id
 * @access public
 * @description Fetch a product by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const productId = req.params.id;
    const sql = "SELECT * FROM products WHERE id = ?";
    const [results] = await db.query(sql, [productId]);
    if (results.length === 0) {
        return res.status(404).json({ error: 'product not found' });
    }
    res.status(200).json(results[0]);
}));





/**
 * @method GET
 * @route /api/products
 * @access public
 * @description Fetch paginated, filtered, and sorted products
 * @query page (default: 1), limit (default: 10), category (optional), sortBy (optional), order (asc|desc)
 */
router.get('/', asyncHandler(async (req, res) => {
    // Extract query params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const category = req.query.category;
    const sortBy = req.query.sortBy || 'id'; // Default sort by ID
    const order = (req.query.order === 'desc') ? 'DESC' : 'ASC';
    const offset = (page - 1) * limit;

    // Validate allowed sort columns
    const allowedSortFields = ['id', 'name', 'price', 'stock'];
    if (!allowedSortFields.includes(sortBy)) {
        return res.status(400).json({ error: 'Invalid sortBy value' });
    }

    // Base query
    let countQuery = `SELECT COUNT(*) AS total FROM products`;
    let dataQuery = `SELECT * FROM products`;
    const queryParams = [];

    // Filter by category
    if (category) {
        countQuery += ` WHERE category = ?`;
        dataQuery += ` WHERE category = ?`;
        queryParams.push(category);
    }

    // Add sorting and pagination
    dataQuery += ` ORDER BY ${sortBy} ${order} LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    // Execute queries
    const [[{ total }]] = await db.query(countQuery, category ? [category] : []);
    const [products] = await db.query(dataQuery, queryParams);

    res.status(200).json({
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        data: products
    });
}));



/**
 * @method POST
 * @route /api/products
 * @access private (admin only)
 * @description Create a new product
 */
router.post('/', checkTokenAndAdmin ,asyncHandler(async (req, res) => {
    // Validate request body
    console.log(req.body)
    const validationError = validateProduct(req.body);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }
    // Insert product into the database
    const { name, mark, category, description, price, stock } = req.body;
    const sql = "INSERT INTO products (name, mark, category, description, price, stock) VALUES (?, ?, ?, ?, ?, ?)";
    try{
        const [results] = await db.query(sql, [name, mark, category, description, price, stock])
        res.status(201).json({ id: results.insertId, description, price, stock });

    }catch(err){
        console.log(err)
        res.status(500).json({error : err})
    }
})
)

/**
 * @method PUT
 * @route /api/products/:id
 * @access private (admin only)
 * @description Update a product by ID
 */
router.put('/:id', checkTokenAndAdmin, asyncHandler(async (req, res) => {
    const productId = req.params.id;

    // Validate request body
    const validationError = validateUpdateProduct(req.body);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }
    // Update product in the database
    const { name, mark, category, description, price, stock } = req.body;
    const sql = "UPDATE products SET name = ?, mark = ?, category = ?, description = ?, price = ?, stock = ? WHERE id = ?";
    try{
        db.query(sql, [name, mark, category, description, price, stock, productId])
         if (results.affectedRows === 0) {
            return res.status(404).json({ error: 'product not found' });
        }
        res.status(200).json({ id: productId, name, description, price, stock });
    }catch(err){
        return res.status(500).json({ error: 'Database query failed' });
    }

    })
)


/**
 * @method DELETE
 * @route /api/products/:id
 * @access private (admin only)
 * @description Delete a product by ID
 */
router.delete('/:id', checkTokenAndAdmin, asyncHandler(async (req, res) => {
    const productId = req.params.id;
    const sql = "DELETE FROM products WHERE id = ?";
    const [results] = await db.query(sql, [productId])
    if (results.affectedRows === 0) {
        return res.status(404).json({ error: 'product not found' });
    }

    return res.status(200).json({ message: 'product deleted successfully' });
}))

router.post('/upload-picture', photoUpload, checkTokenAndAdmin, asyncHandler(async(req,res)=>{
    if(!req.file){
        res.status(400).json({error:"no file provided  "})
    }
    const imagePath =path.join(__dirname,`../images/${req.file.filename}` )

    const result = await uploadImage(imagePath)
    console.log(result)
    const sql = "UPDATE products SET image_url = ?, public_id = ?  WHERE id = ?"
    const [product] = await db.query(sql , [result.secure_url, result.public_id ,req.body.id])
    if (product.affectedRows === 0) {
        return res.status(404).json({ error: 'Product not found' });
    }
    res.status(200).json({
        message: "image uploaded successfully",
        image_url: result.secure_url,
        public_id: result.public_id
    })
    fs.unlinkSync(imagePath)
}))

module.exports = router;
