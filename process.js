require('dotenv').config();
const Papa = require('papaparse');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const isbn = require('node-isbn');
const googlebooks = require('google-books-search');
const {GoogleBooksAPI} = require("google-books-js");
const googleBooksApi = new GoogleBooksAPI();
const sanitize = require("sanitize-filename");
const levenshtein = require('js-levenshtein');
const util = require('util');

Papa.parsePromise = function(file, options) {
	return new Promise(function(complete, error) {
		Papa.parse(file, {...options, complete, error});
	});
};

googlebooks.searchPromise = util.promisify(googlebooks.search);

async function getBooks() {
	return (await Papa.parsePromise(fs.readFileSync('./Library Books - Books.tsv', "utf8"), {delimiter: "\t", header: true})).data;
}

function cleanBook(book) {
	["Author", "Title", "Description", "Keywords", "Publisher", "Date", "Status", "TimesLent", "ISBN", "Value", "BindingPages"].forEach(field => {
		book[field] = book[field].trim();
		book[field] = book[field].replace(/\s\s+/g, ' ');
		book[field] = book[field].replace(/ \: /, ": ");
	});
	["The", "A", "An"].forEach(prefix => {
		if (book.Title.endsWith(", " + prefix)) book.Title = prefix + " " + book.Title.slice(0, - (prefix.length + 2));
		if (book.Title.endsWith(" " + prefix)) book.Title = prefix + " " + book.Title.slice(0, - (prefix.length + 1));
		if (book.Title.includes(", " + prefix + ": ")) book.Title = prefix + " " + book.Title.replace(", " + prefix + ": ", ": ");
	});
	book.Author = book.Author.replace("Ackroyed", "Ackroyd");
	book.Title = book.Title.replace("Nonsence", "Nonsense");
	if (book.Author.includes(", ")) {
		//book.Author = book.Author.split(", ").reverse().join(" ");
		book.Author = book.Author.split(";").map(author => author.split(", ").reverse().join(" ")).join(", ");
	} else if (book.Author.includes(" & ")) {
		book.Author = book.Author.split(" & ").join(", ");
	} else {
		book.Author = book.Author.split(" ", 2).reverse().join(" ");
	}
	const bindingpages = book.BindingPages.split("/");
	if (bindingpages[0] == "H") {
		book.Binding = "Hardback";
	} else if (bindingpages[0] == "P") {
		book.Binding = "Paperback";
	}
	if (book.BindingPages.length > 1) {
		book.Pages = parseInt(bindingpages[1]);
	}
	if (book.Date) book.Date = parseInt(book.Date);
	if (book.Value) {
		if (book.Value.includes("US")) {
			book.Value = parseFloat(book.Value.replace("US", "").replace("$", "").trim());
			book.Currency = "USD";
		} else if (book.Value.includes("£")) {
			book.Value = parseFloat(book.Value.replace("£", "").trim());
			book.Currency = "GBP";
		} else if (book.Value.includes("AU")) {
			book.Value = parseFloat(book.Value.replace("AU", "").replace("$", "").trim());
			book.Currency = "AUD";
		} else if (book.Value.includes("A")) {
			book.Value = parseFloat(book.Value.replace("A", "").replace("$", "").trim());
			book.Currency = "AUD";
		} else {
			book.Value = parseFloat(book.Value.replace("NZ", "").replace("$", "").trim());
			book.Currency = "NZD";
		}
	}
	book.ISBN = book.ISBN.trim().replace(/\-/g, "");
	return book;
}

async function getISBN(book) {
	if (!book.ISBN) return [];
	const cachefolder = path.join(__dirname, 'cache', 'ISBN');
	if (!fs.existsSync(cachefolder)) fs.mkdirSync(cachefolder, {recursive: true});
	const cachepath = path.join(cachefolder, sanitize(book.ISBN) + '.json');
	let match = {};
	if (fs.existsSync(cachepath)) match = require(cachepath);
	else {
		if (download) {
			try {
				match = await isbn.resolve(book.ISBN); // .provider(['google', 'openlibrary', 'worldcat'])
				// await new Promise(resolve => setTimeout(resolve, 1000));
			} catch(error) {
				// console.log(error);
			}
			fs.writeFileSync(cachepath, JSON.stringify(match, null, '\t'));
		}
	}
	if (match) return [{
		...match,
		isbn: match.industryIdentifiers?.length ? match.industryIdentifiers.map(id => id.identifier).concat([book.ISBN]) : [book.ISBN],
		source: 'ISBN',
	}];
	return [];
}

async function getOpenLibrary(book) {
	const cachefolder = path.join(__dirname, 'cache', 'OpenLibrary');
	if (!fs.existsSync(cachefolder)) fs.mkdirSync(cachefolder, {recursive: true});
	const cachepath = path.join(cachefolder, sanitize(book.Title + " - " + book.Author) + '.json');
	const cachepath2 = path.join(cachefolder, sanitize(book.Title) + '.json');
	let matches = [];
	if (fs.existsSync(cachepath) || fs.existsSync(cachepath2)) {
		if (fs.existsSync(cachepath)) {
			matches = require(cachepath);
		} else {
			matches = require(cachepath2);
		}
	} else {
		if (download) {
			try {
				console.log('Downloading from OpenLibrary:', book.Title, book.Author);
				const url = 'http://openlibrary.org/search.json?title=' + encodeURIComponent(book.Title) + '&author=' + encodeURIComponent(book.Author);
				matches = (await axios.get(url)).data.docs;
				// await new Promise(resolve => setTimeout(resolve, 1000));
			} catch(error) {
				// console.log(error);
			}
			if (matches && matches.length) {
				fs.writeFileSync(cachepath, JSON.stringify(matches, null, '\t'));
			} else {
				try {
					console.log('Downloading from OpenLibrary:', book.Title);
					const url = 'http://openlibrary.org/search.json?title=' + encodeURIComponent(book.Title);
					matches = (await axios.get(url)).data.docs;
				} catch(error) {
					// console.log(error);
					return [];
				}
				fs.writeFileSync(cachepath2, JSON.stringify(matches, null, '\t'));
			}
		}
	}
	matches = matches?.map(match => ({
		...match,
		authors: match.author_name,
		source: 'OpenLibrary',
	}));
	return matches || [];
}

async function getGoogleBooks(book) {
	const cachefolder = path.join(__dirname, 'cache', 'GoogleBooks');
	if (!fs.existsSync(cachefolder)) fs.mkdirSync(cachefolder, {recursive: true});
	const cachepath = path.join(cachefolder, sanitize(book.Title + " - " + book.Author) + '.json');
	const cachepath2 = path.join(cachefolder, sanitize(book.Title) + '.json');
	let matches = [];
	if (fs.existsSync(cachepath)) { // || fs.existsSync(cachepath2)
		if (fs.existsSync(cachepath)) {
			matches = require(cachepath);
		} else {
			matches = require(cachepath2);
		}
	} else {
		if (download) {
			try {
				console.log('Downloading from GoogleBooks:', book.Title, '-', book.Author);
				const books = await googleBooksApi.search({
					filters: {
						title:  book.Title,
						author: book.Author,
					},
				});
				matches = books.items.map((book) => book.volumeInfo);
			} catch(error) {
				console.log(error);
			}
			if (matches && matches.length) {
				fs.writeFileSync(cachepath, JSON.stringify(matches, null, '\t'));
			} else {
				try {
					console.log('Downloading from GoogleBooks:', book.Title);
					matches = await googlebooks.searchPromise(encodeURIComponent(book.Title), {key: process.env.GOOGLE_API_KEY});
					// await new Promise(resolve => setTimeout(resolve, 1000));
				} catch(error) {
					console.log(error);
					return [];
				}
				fs.writeFileSync(cachepath2, JSON.stringify(matches, null, '\t'));
			}
		}
	}
	matches = matches?.map(match => ({
		...match,
		isbn: match.industryIdentifiers ? match.industryIdentifiers.map(id => id.identifier) : [],
		source: 'GoogleBooks',
	}));
	return matches || [];
}

async function getGoodReads(book) {

}

function matchPercent(title1, title2, authors1, authors2) {
	// console.log([title1, authors1, title2, authors2].join(" | "));
	if (title1.includes(":") && levenshtein(title1.toLowerCase(), title2.toLowerCase()) > levenshtein(title1.split(":", 2)[0].toLowerCase(), title2.toLowerCase())) {
		title1 = title1.split(":", 2)[0];
	}
	const length = title1.length + authors1.length;
	const titlelev = levenshtein(title1.toLowerCase(), title2.toLowerCase());
	const authorlev = (authors2 && authors2.length ? levenshtein(authors1.toLowerCase(), authors2.join(", ").toLowerCase()) : authors1.length);
	const percent = (1 - ((titlelev + authorlev) / length)) * 100;
	return percent;
}

function findBestMatch(book, matches) {
	let bestmatch;
	let highest = 0;
	for (let match of matches) {
		if (book.ISBN && match.isbn) {
			if (match.isbn.includes(book.ISBN)) return {...match, percent: 101};
		}
		/*if (match.publisher && match.publish_year && match.publisher.includes(book.Publisher) && match.publish_year.includes(book.Date)) {
			return match;
		}*/
		const percent = matchPercent(book.Title, match.title, book.Author, match.authors);
		// console.log(percent);
		if (percent > highest) {
			highest = percent;
			bestmatch = match;
		}
	}
	return {...bestmatch, percent: highest};
}

function printResult(book, match) {
	console.log(book.Title, "=>", book.Author.split(", "), match.percent);
	console.log(match.title, "=>", match.authors, match.percent);
}

const download = true;
const refresh = false;
const lowestPercent = 80;

async function all() {
	let books = await getBooks();
	books = books.filter((book) => book.Title);
	let total = 0;
	let matched = 0;
	const matchedBooks = [];
	for (let book of books) {
		book = cleanBook(book);
		// console.log(book);
		let match;
		const isbn = await getISBN(book);
		const google = await getGoogleBooks(book);
		// const open = [];
		// const open = await getOpenLibrary(book);
		const matches = [
			...isbn,
			...google,
			// ...open,
		].filter(match => match.title);
		if (matches?.length) match = findBestMatch(book, matches);
		total++;
		if (match && (match.percent > lowestPercent)) {
			matchedBooks.push(match);
			matched++;
			console.log('Matched:', match.source + ':', book.Title, "|", book.Author, '=>', match.title , '|', match.authors, '   ', match.percent, '%   ', matched, '/', total);
		} else if (match) {
			console.log('No match:', match.source + ':', book.Title, "|", book.Author, '=>', match.title , '|', match.authors, '   ', match.percent, '%   ', matched, '/', total);
		} else {
			console.log('No match:', book.Title, "|", book.Author, '   ', 0, '%   ', matched, '/', total);
		}
	}
	fs.writeFileSync('Books.json', JSON.stringify(matchedBooks, null, '\t'));
}

all();
