# IGCSE Pseudocode IDE

The IGCSE Pseudocode IDE is an IDE specifically for the Pseudocode taught in IGCSE Computer Science. It runs in-browser, and features an editor, console, and additional features that helps students practice their code-writing skills and real-world computer literacy. It can be accessed at https://igcse-ide.com.  
The IDE is open-source, free-to-use, has no ads, and never collects your personal information without your consent.

## Language
Following are some guidelines that the interpreter uses, that do not follow from reading the [official rules](https://igcse-ide.com/rules.pdf).
* Identifiers (Variable/constant/function names)
    * DECLARE does not initialize a variable or a constant, it must be set with a value (`Num <- 5`) before being operated on.
    * Identifiers that differ only in case (AbCd vs aBcD) will be treated as the same, and a warning will be output.
    * Using a keyword (IF, FUNCTION) as an identifier will output a warning but still allow the code to run.
* Arrays
    * Declaring an array fills it with its type's default value (0 for an integer, FALSE for a boolean, etc.)
    * Total array size is limited to 1,000,000 elements.
* Loops
    * In FOR loops, the THEN is allowed to be in the same line as the IF: `IF Num < 5 THEN`. Formatting still moves the THEN to the next line.
    * Loop size is limited to 1,000,000 loops.
* Data Types
    * A char must be in single quotes, otherwise it will be considered a string.
    * A string must be in double quotes, otherwise it will be considered a char.
    * A real can be assigned an integer value (`Num <- 3`), but it will always be output in the real format, with numbers on both sides of the decimal point (`3.0`)
* Operators
    * , or + can be used for concatenating two operands if either is a string or char. Non-string and non-char operands will be converted to strings in the operation.

## Editor
[ACE Editor](https://ace.c9.io/) (BSD license) is used in the IDE. It features automatic highlighting and auto-suggesting for keywords, declared identifiers, numbers, and more. It saves code on your device using localStorage, so you never lose it.

### Formatting
The formatter, available via the Format button or by typing 'format' into the console, automatically arranges the code so that it follows IGCSE guidelines, including capitalizing keywords, fixing indentation, and more.
Try pasting:
```
function Greet(name:string) returns string
if name="" then
output "Hello, stranger!"
else output "Hello, ",name,"!"
endif
endfunction

declare name    :integer
output "Enter your name: "
input  name
output     Greet(name)
```
and see how it works.

## Console
[XtermJS](https://xtermjs.org/) (MIT License) is used for the console. Type 'help' in the console for a list of all commands, which are:
* __run:__ Run the code
* __clear:__ Clear console
* __format:__ Format the code
* __tab:__ Set the editor tab size (0-8 spaces)
* __font:__ Set the editor font size (6-38 px)
* __mode:__ Toggle the mode
* __theme__ Change the editor theme
* __help:__ Print a dialog containing the list of commands


## Splitter and Resizing
The splitter is a handle in between the editor and the console that allows you to resize  them. Double click the splitter to reset to a 50-50 ratio.  
You can also click the buttons on the editor and console to expand and collapse them.  
The layout button lets you switch between a vertical (editor top, console bottom) and a horizontal (editor left, console right) layout.

## Runtime
You can run the code by either clicking the run button or by executing 'run' in the console, and you can stop the code by either clicking the stop button or pressing Ctrl-C in the console.  
Code output is written in the console, and you can input values there as well (just type the input and press enter).  
The code will either finish running successfully, run with warnings, or stop due to an error. 

## Info and Code Examples
If you ever want to see the official documentation by IGCSE, click the info button on the top bar. Click the code examples button (to the left of the info button) to see the different features and functions of the language. Press a button, and code gets filled into the editor. You can run the code, and see, for example, how arrays work.

## Issue Report
Clicking the 'Report an issue' button brings you to the report page. Fill out the details (it'll automatically detect the last JavaScript error and the last error output in the console, so you don't have to paste them). Then, you have two choices. Either open a GitHub Issues form with the same info or submit it directly from the website.  
If there are any issues that are not reportable using the Issue Report feature, email ascoder1248@gmail.com.