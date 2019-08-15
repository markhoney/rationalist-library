const Papa = require('papaparse');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
//const books = require('google-books-search');
const sanitize = require("sanitize-filename");
const levenshtein = require('js-levenshtein');

Papa.parsePromise = function(file, options) {
	return new Promise(function(complete, error) {
		Papa.parse(file, {...options, complete, error});
	});
};

async function getBooks() {
	return (await Papa.parsePromise(fs.readFileSync('./Library Books - Books.tsv', "utf8"), {delimiter: "\t", header: true})).data;
}

function cleanBook(book) {
	["Author", "Title", "Description", "Keywords", "Publisher", "Date", "Status", "TimesLent", "ISBN", "Value", "BindingPages"].forEach(field => {
		book[field] = book[field].trim();
		book[field] = book[field].replace(/\s\s+/g, ' ');
		book[field] = book[field].replace(/ \: /, ": ");
	});
	["The", "A"].forEach(prefix => {
		if (book.Title.endsWith(", " + prefix)) book.Title = prefix + " " + book.Title.slice(0, - (prefix.length + 2));
		if (book.Title.endsWith(" " + prefix)) book.Title = prefix + " " + book.Title.slice(0, - (prefix.length + 1));
		if (book.Title.includes(", " + prefix + ": ")) book.Title = prefix + " " + book.Title.replace(", " + prefix + ": ", ": ");
	});
	book.Author = book.Author.replace("Ackroyed", "Ackroyd");
	book.Title = book.Title.replace("Nonsence", "Nonsense");
	if (book.Author.includes(", ")) {
		book.Author = book.Author.split(", ").reverse().join(" ");
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
	book.ISBN = book.ISBN.replace(/\-/g, "");
	return book;
}

async function getOpenLibrary(book) {
	const cachepath = path.join(__dirname, 'cache', 'OpenLibrary', sanitize(book.Title + " - " + book.Author) + '.json');
	const cachepath2 = path.join(__dirname, 'cache', 'OpenLibrary', sanitize(book.Title) + '.json');
	let matches;
	if (fs.existsSync(cachepath) || fs.existsSync(cachepath2)) {
		if (fs.existsSync(cachepath)) {
			matches = require(cachepath);
		} else {
			matches = require(cachepath2);
		}
	} else {
		if (download) {
			try {
				const url = 'http://openlibrary.org/search.json?title=' + encodeURIComponent(book.Title) + '&author=' + encodeURIComponent(book.Author);
				matches = (await axios.get(url)).data.docs;
			} catch(error) {
				//console.log(error);
			}
			if (matches && matches.length) {
				fs.writeFileSync(cachepath, JSON.stringify(matches, null, '\t'));
			} else {
				try {
					const url = 'http://openlibrary.org/search.json?title=' + encodeURIComponent(book.Title);
					matches = (await axios.get(url)).data.docs;
				} catch(error) {
					//console.log(error);
				}
				if (matches && matches.length) {
					fs.writeFileSync(cachepath2, JSON.stringify(matches, null, '\t'));
				}
			}
		}
	}
	return matches;
}

function findBestMatch(book, matches) {
	let bestmatch;
	let lowest = 999;
	for (let match of matches) {
		if (book.ISBN && match.isbn && match.isbn.includes(book.ISBN)) {
			return match;
		}
		/*if (match.publisher && match.publish_year && match.publisher.includes(book.Publisher) && match.publish_year.includes(book.Date)) {
			return match;
		}*/
		const lev = Math.min(levenshtein(book.Title.split(":")[0].toLowerCase(), match.title.toLowerCase()), levenshtein(book.Title.toLowerCase(), match.title.toLowerCase())) + (match.author_name && match.author_name.length ? levenshtein(book.Author.toLowerCase(), match.author_name.join(", ").toLowerCase()) : 5);
		if (lev < lowest && lev <= 10) {
			lowest = lev;
			bestmatch = match;
		}
	}
	return bestmatch;
}

function printResult(book, match) {
	console.log(book.Title, levenshtein(book.Title.toLowerCase(), match.title.toLowerCase()), match.title);
	if (match.author_name && match.author_name.length) console.log(book.Author, levenshtein(book.Author.toLowerCase(), match.author_name[0].toLowerCase()), match.author_name[0]);
}

const download = false;

async function all() {
	let books = await getBooks();
	let total = 0;
	for (let book of books) {
		book = cleanBook(book);
		const matches = await getOpenLibrary(book);
		if (matches && matches.length) {
			const match = findBestMatch(book, matches);
			if (match) {
				total++;
				//printResult(book, match);
			}
		}
	}
	console.log(total);
}
all();
