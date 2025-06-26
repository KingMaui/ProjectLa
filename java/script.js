/* navbar */

const toggleButton = document.getElementsByClassName('toggle-button')[0]
const navbarlinks = document.getElementsByClassName('navbar-links')[0]

toggleButton.addEventListener('click',()=> {
    navbarlinks.classList.toggle('active')

});

/* contact */
document.getElementById('Contact').addEventListener('click',function() {
    document.querySelector('.bg-modal').style.display = 'flex';
});

document.querySelector('.close').addEventListener('click',function() {
    document.querySelector('.bg-modal').style.display = 'none';
});

/* projects */

