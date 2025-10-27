export function initExamples({
    panelEl,
    openBtn,
    closeBtn,
    overlayEl = null,
    editorApis = null
} = {}) {
    // ------------------------ Open and Close ------------------------
    function open() {
        panelEl.style.display = 'flex';
        overlayEl?.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    function close() {
        panelEl.style.display = 'none';
        overlayEl?.classList.remove('show');
        document.body.style.overflow = '';
    }

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlayEl?.addEventListener('click', (e) => {
        if (e.target === overlayEl) close(); // close if clicking on backdrop
    });

    // ------------------------ Buttons --------------------------

    // Variables
    const varsConstsDTsBtn = panelEl.querySelector('#varsConstsDTsExampleBtn');
    if (varsConstsDTsBtn && editorApis) {
        varsConstsDTsBtn.addEventListener('click', () => {
            const code = `// Variables, Constants, and Data Types

CONSTANT Pi <- 3.1415

DECLARE Age : INTEGER
DECLARE Height : REAL
DECLARE Sex : CHAR
DECLARE Name : STRING
DECLARE IsStudent : BOOLEAN

// Assign values
Age <- 20
Height <- 1.75
Sex <- 'F'
Name <- "Clara"
IsStudent <- TRUE

// Reassignment
Age <- Age + 1
Height <- Height + 0.05
// Pi <- 2 * Pi would throw an error

// Output variable values
OUTPUT "Name: ", Name
OUTPUT "Sex: ", Sex
OUTPUT "Age: ", Age
OUTPUT "Height: ", Height
OUTPUT "Is a student? ", IsStudent
OUTPUT "Pi = ", Pi
`;
            editorApis.setCode?.(code, true);
            close();
        });
    }

    // Input/Output
    const iOBtn = panelEl.querySelector('#iOExampleBtn');
    if (iOBtn && editorApis) {
        iOBtn.addEventListener('click', () => {
            const code = `// Input & Output

DECLARE Name : STRING
DECLARE Age : INTEGER

OUTPUT "Enter your name: "
INPUT Name
OUTPUT "Enter your age: "
INPUT Age

OUTPUT "Hello ", Name, "!"
OUTPUT "You are ", Age, " years old."
`;
            editorApis.setCode?.(code, true);
            close();
        });
    }

    // Arithmetic Operations
    const arithmeticOpsBtn = panelEl.querySelector('#arithOpsExampleBtn');
    if (arithmeticOpsBtn && editorApis) {
        arithmeticOpsBtn.addEventListener('click', () => {
            const code = `// Arithmetic Operations

DECLARE A, B : INTEGER

OUTPUT "Enter A (integer): "
INPUT A
OUTPUT "Enter B (integer, not 0): "
INPUT B

OUTPUT ""
OUTPUT "Sum = ", A + B
OUTPUT "Difference = ", A - B
OUTPUT "Product = ", A * B
OUTPUT "Quotient = ", A / B
OUTPUT "Power = ", A ^ B
OUTPUT "A = ", DIV(A, B), "*B + ", MOD(A, B)
OUTPUT "Average of A and B = ", (A + B) / 2
OUTPUT "Rounded average = ", ROUND((A+B)/2, 0)
OUTPUT "Random number (0 to 1): ", RANDOM()
`;
            editorApis.setCode?.(code, true);
            close();
        });
    }

    // String Operations
    const strOpsBtn = panelEl.querySelector('#strOpsExampleBtn');
    if (strOpsBtn && editorApis) {
        strOpsBtn.addEventListener('click', () => {
            const code = `// String Operations

DECLARE Name, LowerCaseName, UpperCaseName, Part : STRING
DECLARE LengthOfName : INTEGER

OUTPUT "Enter your name (more than 3 characters): "
INPUT Name

OUTPUT "Your name's length is ", LENGTH(Name)
OUTPUT "Your name in lower case is ", LCASE(Name)
OUTPUT "Your name in upper case is ", UCASE(Name)
OUTPUT "The first three characters of your name are ", SUBSTRING(Name, 1, 3)
`;
            editorApis.setCode?.(code, true);
            close();
        });
    }

    // Logical Operations
    const logicOpsBtn = panelEl.querySelector('#logicOpsExampleBtn');
    if (logicOpsBtn && editorApis) {
        logicOpsBtn.addEventListener('click', () => {
            const code = `// Logical Operations

DECLARE A, B : INTEGER
DECLARE IsEqual, IsGreater, IsSmaller, InRange, NotEqual : BOOLEAN
DECLARE Age : INTEGER
DECLARE Eligible : BOOLEAN

// Section 1 - Discount check
OUTPUT "Enter your age (integer): "
INPUT Age
Eligible <- (Age < 18) OR (Age >= 65)

IF Eligible
  THEN
    OUTPUT "You are eligible for a discount."
  ELSE
    OUTPUT "You are not eligible for a discount."
ENDIF

// Section 2 - More operations
OUTPUT ""
OUTPUT "Enter A (integer): "
INPUT A
OUTPUT "Enter B (integer): "
INPUT B

OUTPUT ""
OUTPUT "A = B? ", A = B
OUTPUT "A not equal to B? ", A <> B
OUTPUT "A > B? ", A > B
OUTPUT "A < B? ", A < B
`;
            editorApis.setCode?.(code, true);
            close();
        });
    }

    // Conditionals
    const conditionalsBtn = panelEl.querySelector('#conditionalsExampleBtn');
    if (conditionalsBtn && editorApis) {
        conditionalsBtn.addEventListener('click', () => {
            const code = `// Conditionals

// IF
DECLARE Grade : INTEGER
DECLARE Result : STRING

OUTPUT "Enter your exam grade (0-100): "
INPUT Grade

IF Grade >= 85
  THEN
    Result <- "passed with high marks"
  ELSE
    IF Grade >= 60
      THEN
        Result <- "passed"
      ELSE
        Result <- "failed"
    ENDIF
ENDIF

OUTPUT "You ", Result, "."

// CASE OF
DECLARE Choice : CHAR

OUTPUT "Enter a command (W/A/S/D in uppercase): "
INPUT Choice

CASE OF Choice
  'W' : OUTPUT "You moved up."
  'A' : OUTPUT "You moved left."
  'S' : OUTPUT "You moved down."
  'D' : OUTPUT "You moved right."
  OTHERWISE OUTPUT "Invalid command."
ENDCASE
`;
            editorApis.setCode?.(code, true);
            close();
        });
    }

    // Loops
    const loopsBtn = panelEl.querySelector('#loopsExampleBtn');
    if (loopsBtn && editorApis) {
        loopsBtn.addEventListener('click', () => {
            const code = `// Loops

// FOR
DECLARE Counter : INTEGER
OUTPUT "Counting from 1 to 5:"
FOR Counter <- 1 TO 5
    OUTPUT Counter
NEXT Counter

// REPEAT UNTIL (post-condition)
DECLARE Password : STRING
REPEAT
    OUTPUT "Enter the password: "
    INPUT Password
UNTIL Password = "Secret"
OUTPUT "Access granted."

// WHILE (pre-condition)
DECLARE Total : INTEGER
Total <- 0
Counter <- 1
WHILE Counter <= 5 DO
    Total <- Total + Counter
    Counter <- Counter + 1
ENDWHILE
OUTPUT "The sum of numbers 1 to 5 is ", Total
`;
            editorApis.setCode?.(code, true);
            close();
        });
    }

    // Arrays
    const arraysBtn = panelEl.querySelector('#arraysExampleBtn');
    if (arraysBtn && editorApis) {
        arraysBtn.addEventListener('click', () => {
            const code = `// Arrays

DECLARE Numbers : ARRAY[1:5] OF INTEGER
DECLARE Temp : INTEGER
DECLARE Len, i, j : INTEGER

OUTPUT "Input length of array (2-10): "
REPEAT
    INPUT Len
UNTIL Len >= 2 AND Len <= 10

// Input
DECLARE Numbers : ARRAY[1:Len] OF INTEGER
FOR i <- 1 TO Len
    OUTPUT "Enter number ", i, ": "
    INPUT Numbers[i]
NEXT i

// Bubble Sort
FOR i <- 1 TO Len - 1
    FOR j <- 1 TO Len - i
        IF Numbers[j] > Numbers[j + 1]
          THEN
            Temp <- Numbers[j]
            Numbers[j] <- Numbers[j + 1]
            Numbers[j + 1] <- Temp
        ENDIF
    NEXT j
NEXT i

OUTPUT ""
OUTPUT "Numbers in ascending order:"
FOR i <- 1 TO Len
    OUTPUT Numbers[i]
NEXT i
`;

            editorApis.setCode?.(code, true);
            close();
        });
    }

    // Procedures & Functions
    const funcsProcsBtn = panelEl.querySelector('#funcsProcsExampleBtn');
    if (funcsProcsBtn && editorApis) {
        funcsProcsBtn.addEventListener('click', () => {
            const code = `// Procedures and Functions

// Procedures
PROCEDURE Welcome
    OUTPUT "Welcome to this demo!"
ENDPROCEDURE

PROCEDURE DisplaySum(X : INTEGER, Y : INTEGER)
    DECLARE Sum : INTEGER
    Sum <- X + Y
    OUTPUT "The sum of ", X, " and ", Y, " is ", Sum
ENDPROCEDURE

// Functions
FUNCTION Square(Number : INTEGER) RETURNS INTEGER
    RETURN Number * Number
ENDFUNCTION

FUNCTION RandomPercentage RETURNS REAL
    RETURN ROUND(RANDOM() * 100, 2)
ENDFUNCTION

// Main prorgam
DECLARE A, B : INTEGER
DECLARE Result : INTEGER
DECLARE Chance : REAL

CALL Welcome

OUTPUT "Enter A (integer): "
INPUT A
OUTPUT "Enter B (integer): "
INPUT B

CALL DisplaySum(A, B)
OUTPUT "Sum of squares = ", Square(A) + Square(B)
OUTPUT "Random percentage = ", RandomPercentage(), "%"
`;

            editorApis.setCode?.(code, true);
            close();
        });
    }

    return { open, close };
}

