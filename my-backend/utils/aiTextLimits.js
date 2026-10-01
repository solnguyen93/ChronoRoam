const { BadRequestError } = require('../expressError');

// The most text one AI import accepts (about 11,000 AI tokens, a few cents at most), so pasting
// something huge by mistake can't make one call expensive. Real booking emails have been up to
// about 26,000 characters.
const MAX_PASTED_TEXT_CHARS = 40000;

// Throws a 400 if the text is longer than that.
function assertReasonableLength(text) {
    if (text.length > MAX_PASTED_TEXT_CHARS) {
        throw new BadRequestError(`That's too long to extract from (${text.length.toLocaleString()} characters, max ${MAX_PASTED_TEXT_CHARS.toLocaleString()}). Try pasting just the flight/booking details rather than the whole email.`);
    }
}

module.exports = { assertReasonableLength, MAX_PASTED_TEXT_CHARS };
