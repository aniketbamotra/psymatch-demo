<script>
	export let main;
	export let body;
	export let state;
	let class_ = {
		bg: 'bg-red-600/10',
		text: 'text-red-600'
	};
	if (state === 'success') {
		class_.bg = 'bg-Success/10';
		class_.text = 'text-Success';
	} else {
		class_.bg = 'bg-red-600/10';
		class_.text = 'text-red-600';
	}
</script>

<div class="{class_.bg} p-4 rounded-lg mt-5">
	<p class="{class_.text} font-medium">{main}</p>
	<p class="text-gray-600 mt-2">{body}</p>
</div>
