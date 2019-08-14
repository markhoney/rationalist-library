# NZARH (Rationalists) Library Books

This script processes and cleans an exported TSV file of library books held by the [NZARH](http://rationalists.nz/) (New Zealand Association of Rationalists and Humanists, otherwise known as the Rationalists), and then attempts to match each book to a google books entry.

## Source

The source data has been compiled by Ngaire McCarthy, and a live copy is kept at:

[https://docs.google.com/spreadsheets/d/1GOU_5lbI0Fp5R0y32Am0klloV4MKgMmFEYv60ckxygg](https://docs.google.com/spreadsheets/d/1GOU_5lbI0Fp5R0y32Am0klloV4MKgMmFEYv60ckxygg)

The spreadsheet contains the following fields:

- Author - The Author, or authors, of the book
- Title - The title of the book, including subtitle
- Description - A short description of the book's contents
- Keywords - Keywords describing the book's topics
- Publisher - The book's published
- Date - The year the book was published
- Status - Whether the book can be lent out (Lending), or is for reference only (Reference)
- TimesLent - The number of times the book as been lent out
- ISBN - The ISBN number of the book
- Value - The purchase price of the book
- BindingPages - The type of Binding (H for Hardback, P for Paperback) and number of pages in the book

An example (complete) line of data would look like:

| Barcode | Author           | Title               | Description                         | Keywords      | Publisher        | Date   | Status  | TimesLent | ISBN          | Value | BindingPages |
| ------- | ---------------- | ------------------- | ----------------------------------- | ------------- | ---------------- | ------ | ------- | --------- | ------------- | -------- | --------- |
| 100796  | Barrett, Stephen | Health Robbers, The | A close look at quackery in America | Pseudoscience | Prometheus Books | 1993   | Lending | 2         | 0-87975-855-4 | $US25.95 | H/526     |

## Processing

The script `process.js` uses [PapaParse](https://www.papaparse.com/) to import the TSV file, which has simply been exported from Google Sheets as a TSV. Then it cleans up the data using a few regexes. Finally, it places a call to the google books API (via the google-books-search NPM package) and caches the results.

## To Do

The script still needs to work out which of the results from Google is the best result for each book listing, and should be able to do this by matching ISBN (where it's available in the source data), or matching the publishing year and checking the closeness of the title and author's name (likely by using a Levenshtein distance). Both title and author will need some work, as sometimes a title is split into a title and subtitle in the google results, and sometimes there are multiple authors.

## Publishing

Once the data set is completed, it will likely be exported back to a TSV to be re-imported to a new Google Sheet. A copy of the data will also be exported as JSON, and there is a plan to publish the data on the NZARH website using a plugin such as [TablePress](https://wordpress.org/plugins/tablepress/)
